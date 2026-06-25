import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { accounts, merchants, subscriptions } from '@lumina/db';
import { PlanChangeRequestSchema, SELLABLE_PLAN_TIERS, shopLimit } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { createStripeClient } from '@/lib/billing/stripe';
import { changeSubscriptionPlan, planChangeSuspendSet } from '@/lib/billing/change';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /v1/billing/change — change the account's plan in-app, up or down (no Stripe-portal detour). Upgrades
 * just swap the Stripe price; downgrades additionally, when the new plan allows fewer shops, reversibly
 * suspend the workspaces NOT in `keepMerchantIds`. Either way the new price applies at the next renewal
 * (`proration_behavior: 'none'`). Account-owner only. Stripe runs before any deactivation. Enterprise
 * (contact sales) and `free` (cancel via the portal) are not valid targets here.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = PlanChangeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid plan change request');
  }
  const { targetPlan, keepMerchantIds = [] } = parsed.data;

  // Only sellable paid tiers are valid targets here. This rejects `free` (cancel → use the portal, so the
  // subscription truly ends before any deactivation) and the legacy `scale`, closing the price-less-target
  // edge where a shop would be deactivated immediately while still billed for the higher plan.
  if (targetPlan === 'enterprise' || !SELLABLE_PLAN_TIERS.includes(targetPlan)) {
    return errorResponse('invalid_input', 'That plan cannot be selected here.');
  }

  // Resolve the owning account + require the caller is the ACCOUNT owner (governs billing, the shop cap,
  // and the cross-shop deactivation) — not merely the active shop's membership role.
  const [acc] = await guard.db
    .select({ id: accounts.id, plan: accounts.plan, ownerUserId: accounts.ownerUserId })
    .from(merchants)
    .innerJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  if (!acc) {
    return errorResponse('not_found', 'Account not found');
  }
  if (acc.ownerUserId !== guard.user.id) {
    return errorResponse('unauthorized', 'Only the account owner can change the plan');
  }
  if (acc.plan === targetPlan) {
    return errorResponse('invalid_input', "That's already your current plan.");
  }

  // The account's live subscription (on whichever shop subscribed).
  const [subRow] = await guard.db
    .select({ subscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .innerJoin(merchants, eq(subscriptions.merchantId, merchants.id))
    .where(and(eq(merchants.accountId, acc.id), isNotNull(subscriptions.stripeSubscriptionId)))
    .limit(1);
  if (!subRow?.subscriptionId) {
    return errorResponse('invalid_input', 'No active subscription to change.');
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return serverError('Billing is not configured');
  }

  // Validate the keep-selection + compute who gets deactivated (pure, zero side effects).
  const activeIds = (
    await guard.db
      .select({ id: merchants.id })
      .from(merchants)
      .where(and(eq(merchants.accountId, acc.id), isNull(merchants.suspendedAt)))
  ).map((r) => r.id);
  const validation = planChangeSuspendSet(activeIds, keepMerchantIds, shopLimit(targetPlan));
  if (!validation.ok) {
    return errorResponse('invalid_input', validation.error);
  }
  const { suspendMerchantIds } = validation;

  // If the active workspace is being deactivated, tell the dashboard which kept shop to switch into.
  const keepSet = new Set(keepMerchantIds);
  const activeMerchantReset = suspendMerchantIds.includes(guard.merchantId)
    ? (keepMerchantIds[0] ?? activeIds.find((id) => keepSet.has(id)) ?? null)
    : null;

  const stripe = createStripeClient(secret);
  const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;
  try {
    await changeSubscriptionPlan(stripe, guard.db, process.env, {
      accountId: acc.id,
      subscriptionId: subRow.subscriptionId,
      targetPlan,
      suspendMerchantIds,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Plan change failed';
    return serverError(`Could not change the plan: ${message}`);
  }

  return jsonResponse({ ok: true, ...(activeMerchantReset ? { activeMerchantReset } : {}) });
}

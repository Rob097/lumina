import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { merchants, type Database } from '@lumina/db';
import type { PlanTier } from '@lumina/shared';
import { priceForPlan } from './stripe.js';

export type KeepValidation =
  | { ok: true; suspendMerchantIds: string[] }
  | { ok: false; error: string };

/**
 * Validate a downgrade's keep-selection and compute who gets deactivated. Pure (the adversarial review's
 * top concern): rejects foreign/duplicate ids and a wrong keep-count with ZERO side effects, before any
 * Stripe or DB mutation. When the downgrade doesn't reduce the active count, no selection is allowed.
 */
export function planChangeSuspendSet(
  activeIds: string[],
  keepMerchantIds: string[],
  targetLimit: number,
): KeepValidation {
  const reduces = activeIds.length > targetLimit;
  if (!reduces) {
    if (keepMerchantIds.length > 0) {
      return { ok: false, error: 'No workspace selection is needed for this change.' };
    }
    return { ok: true, suspendMerchantIds: [] };
  }
  const keepSet = new Set(keepMerchantIds);
  if (keepSet.size !== keepMerchantIds.length) {
    return { ok: false, error: 'Duplicate workspace in the selection.' };
  }
  if (keepMerchantIds.length !== targetLimit) {
    return {
      ok: false,
      error: `Select exactly ${targetLimit} workspace${targetLimit === 1 ? '' : 's'} to keep active.`,
    };
  }
  const activeSet = new Set(activeIds);
  if (!keepMerchantIds.every((id) => activeSet.has(id))) {
    return { ok: false, error: 'Selection includes a workspace that is not an active shop here.' };
  }
  return { ok: true, suspendMerchantIds: activeIds.filter((id) => !keepSet.has(id)) };
}

export interface ChangePlanInput {
  accountId: string;
  subscriptionId: string;
  targetPlan: PlanTier;
  /** Active workspaces to deactivate (reversibly). Empty when the downgrade doesn't reduce the cap. */
  suspendMerchantIds: string[];
  idempotencyKey?: string;
}

/**
 * Downgrade an account's Stripe subscription, then — only after Stripe confirms — reversibly suspend the
 * non-kept workspaces. **Stripe FIRST**: the reversible step that can fail runs before any deactivation,
 * so a Stripe error never leaves workspaces deactivated. Never touches the account row or the shared
 * credit pool. `accounts.plan` is updated by the webhook, not here (single source of truth). The suspend
 * step is serialized per-account (advisory lock) and refuses to deactivate every workspace.
 */
export async function changeSubscriptionPlan(
  stripe: Stripe,
  db: Database,
  env: Record<string, string | undefined>,
  input: ChangePlanInput,
): Promise<{ suspended: string[] }> {
  const { accountId, subscriptionId, targetPlan, suspendMerchantIds, idempotencyKey } = input;
  const opts = idempotencyKey ? { idempotencyKey } : {};
  const price = priceForPlan(env, targetPlan);

  // --- Stripe first (reversible) ---
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = sub.items.data[0]?.id;
  if (!itemId) {
    throw new Error('subscription has no line items');
  }
  if (price) {
    await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [{ id: itemId, price }],
        proration_behavior: 'none',
        billing_cycle_anchor: 'unchanged',
      },
      opts,
    );
  } else {
    // A price-less target (free) = schedule cancellation at the period end.
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true }, opts);
  }

  // --- Then deactivate the non-kept shops (reversible), only after Stripe success ---
  if (suspendMerchantIds.length === 0) {
    return { suspended: [] };
  }
  return db.transaction(async (tx) => {
    // Serialize per-account so two concurrent downgrades with divergent selections can't race the
    // account down to zero active workspaces.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${accountId}::text, 0))`);
    const activeCount =
      (
        await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(merchants)
          .where(and(eq(merchants.accountId, accountId), isNull(merchants.suspendedAt)))
      )[0]?.n ?? 0;
    const toSuspend = (
      await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(
          and(
            eq(merchants.accountId, accountId),
            isNull(merchants.suspendedAt),
            inArray(merchants.id, suspendMerchantIds),
          ),
        )
    ).map((r) => r.id);
    if (activeCount - toSuspend.length < 1) {
      throw new Error('refusing to deactivate every workspace');
    }
    if (toSuspend.length > 0) {
      await tx
        .update(merchants)
        .set({ suspendedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(merchants.accountId, accountId), inArray(merchants.id, toSuspend)));
    }
    return { suspended: toSuspend };
  });
}

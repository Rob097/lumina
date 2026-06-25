import { and, eq, isNotNull } from 'drizzle-orm';
import { accounts, merchants, subscriptions } from '@lumina/db';
import { buildBillingPlans } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/billing/plans — plan cards + the account's current tier (shared across the owner's shops). */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const [row] = await guard.db
    .select({ plan: accounts.plan, accountId: accounts.id })
    .from(merchants)
    .innerJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  if (!row) {
    return errorResponse('not_found', 'Merchant not found');
  }
  // Does the account already have a live Stripe subscription (on any of its shops)? Drives the dashboard's
  // portal-vs-checkout routing.
  const [sub] = await guard.db
    .select({ id: subscriptions.merchantId })
    .from(subscriptions)
    .innerJoin(merchants, eq(subscriptions.merchantId, merchants.id))
    .where(and(eq(merchants.accountId, row.accountId), isNotNull(subscriptions.stripeSubscriptionId)))
    .limit(1);
  return jsonResponse(buildBillingPlans(row.plan, { hasActiveSubscription: Boolean(sub) }));
}

import { eq } from 'drizzle-orm';
import { accounts, merchants, type Database } from '@lumina/db';
import type { PlanTier } from '@lumina/shared';

/**
 * The billing plan that governs a merchant's entitlements: the owning **account's** plan (plan + credits
 * are pooled there since the account model). Falls back to the merchant's own `plan` column if the row
 * isn't linked to an account yet, and to `free` if the merchant can't be found. The single source for
 * feature gating (e.g. analytics) so the gate matches what the billing screen shows.
 */
export async function resolveAccountPlan(db: Database, merchantId: string): Promise<PlanTier> {
  const [row] = await db
    .select({ accountPlan: accounts.plan, merchantPlan: merchants.plan })
    .from(merchants)
    .leftJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, merchantId))
    .limit(1);
  return row?.accountPlan ?? row?.merchantPlan ?? 'free';
}

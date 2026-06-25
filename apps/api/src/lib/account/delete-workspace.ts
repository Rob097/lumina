import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { merchants, subscriptions, type Database } from '@lumina/db';
import { OBJECT_ROOTS, type MerchantPurgeStorage } from './purge.js';

export type DeleteWorkspaceFailure = 'not_found' | 'last_active' | 'has_subscription';

/** A refused workspace deletion, carrying a machine `reason` the route maps to an HTTP error. */
export class WorkspaceDeleteError extends Error {
  constructor(
    public readonly reason: DeleteWorkspaceFailure,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceDeleteError';
  }
}

/**
 * Permanently delete a workspace from an account. The caller must already have verified the session user is
 * the account owner; this enforces the data-safety invariants under a per-account advisory lock so two
 * concurrent deletes can't race the account down to zero active workspaces:
 *
 *  - the target must still belong to `accountId`,
 *  - it must NOT hold the live Stripe subscription (the `subscriptions` row is keyed to the merchant and
 *    would cascade away, orphaning billing — cancel/move billing first), and
 *  - deleting it must leave at least one ACTIVE (non-suspended) workspace.
 *
 * On success the merchant row is cascade-deleted (memberships, products, generations, credit_ledger, the
 * customer-only subscription row, …) and the merchant's R2 objects are removed best-effort.
 */
export async function deleteWorkspace(
  db: Database,
  storage: MerchantPurgeStorage,
  input: { merchantId: string; accountId: string },
): Promise<void> {
  const { merchantId, accountId } = input;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${accountId}::text, 0))`);

    const [target] = await tx
      .select({ accountId: merchants.accountId })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .limit(1);
    if (!target || target.accountId !== accountId) {
      throw new WorkspaceDeleteError('not_found', 'Workspace not found');
    }

    const [liveSub] = await tx
      .select({ id: subscriptions.stripeSubscriptionId })
      .from(subscriptions)
      .where(
        and(eq(subscriptions.merchantId, merchantId), isNotNull(subscriptions.stripeSubscriptionId)),
      )
      .limit(1);
    if (liveSub) {
      throw new WorkspaceDeleteError(
        'has_subscription',
        'This workspace holds your active subscription. Change or cancel billing before deleting it.',
      );
    }

    const activeIds = (
      await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(and(eq(merchants.accountId, accountId), isNull(merchants.suspendedAt)))
    ).map((r) => r.id);
    if (activeIds.filter((id) => id !== merchantId).length < 1) {
      throw new WorkspaceDeleteError(
        'last_active',
        "You can't delete your only active workspace. Create or activate another first.",
      );
    }

    await tx.delete(merchants).where(eq(merchants.id, merchantId));
  });

  // R2 cleanup is best-effort and outside the transaction — orphaned objects are harmless and are swept by
  // the GDPR/retention purges; a storage hiccup must never roll back a committed deletion.
  for (const root of OBJECT_ROOTS) {
    await storage.deleteByPrefix(`${root}/${merchantId}/`).catch(() => 0);
  }
}

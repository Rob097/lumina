import { eq } from 'drizzle-orm';
import { accounts, merchants, type Database } from '@lumina/db';

/**
 * True iff `userId` is the OWNER of the billing account that owns `merchantId`. Governs billing +
 * destructive account actions — distinct from the per-workspace membership role (a support member is a
 * super-admin operationally but is never the account owner of a customer's workspace, so it cannot touch
 * billing). Mirrors the inline check in `billing/change`.
 */
export async function isAccountOwner(
  db: Database,
  merchantId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ ownerUserId: accounts.ownerUserId })
    .from(merchants)
    .innerJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, merchantId))
    .limit(1);
  return row?.ownerUserId === userId;
}

import { and, eq, ne } from 'drizzle-orm';
import { pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { memberships, merchants, type Database } from '@lumina/db';
import type { TeamMember } from '@lumina/shared';

/**
 * Account/team reads for Settings (§6.3). Every query is scoped by `merchant_id` (HARD RULE #1).
 * `auth.users` is Supabase-managed (not in the Drizzle schema, D6); we reference a minimal read-only
 * view of it here purely to resolve member emails — drizzle-kit never sees it, so it stays unmanaged.
 */
const authUsers = pgSchema('auth').table('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
});

export async function listTeam(db: Database, merchantId: string): Promise<TeamMember[]> {
  const rows = await db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      joinedAt: memberships.createdAt,
      email: authUsers.email,
    })
    .from(memberships)
    .leftJoin(authUsers, eq(authUsers.id, memberships.userId))
    // Hide the internal platform-support account(s) from the merchant's member list — `role='support'`
    // is provisioned by us directly and must be invisible to the tenant (it's a super-admin, not a seat).
    .where(and(eq(memberships.merchantId, merchantId), ne(memberships.role, 'support')))
    .orderBy(memberships.createdAt);

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email ?? null,
    role: r.role,
    joinedAt: r.joinedAt.toISOString(),
  }));
}

/** Rename the merchant. Returns whether a row was updated. */
export async function updateMerchantName(
  db: Database,
  merchantId: string,
  name: string,
): Promise<boolean> {
  const rows = await db
    .update(merchants)
    .set({ name, updatedAt: new Date() })
    .where(eq(merchants.id, merchantId))
    .returning({ id: merchants.id });
  return rows.length > 0;
}

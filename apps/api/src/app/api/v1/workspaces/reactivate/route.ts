import { and, eq, isNull, sql } from 'drizzle-orm';
import { accounts, merchants } from '@lumina/db';
import { ReactivateWorkspaceSchema, shopLimit } from '@lumina/shared';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /v1/workspaces/reactivate — re-activate a workspace that was deactivated by a downgrade. Allowed
 * only by the account owner and only while the account is under its plan's active-shop cap (so you can't
 * exceed the allowance by reactivating — upgrade first).
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return errorResponse('unauthorized', 'Not authenticated');
  }
  const parsed = ReactivateWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid request');
  }
  const db = getDb();
  const [row] = await db
    .select({
      accountId: accounts.id,
      plan: accounts.plan,
      ownerUserId: accounts.ownerUserId,
      suspendedAt: merchants.suspendedAt,
    })
    .from(merchants)
    .innerJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, parsed.data.merchantId))
    .limit(1);
  if (!row || row.ownerUserId !== user.id) {
    return errorResponse('not_found', 'Workspace not found');
  }
  if (!row.suspendedAt) {
    return jsonResponse({ ok: true }); // already active — idempotent
  }
  const activeCount =
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(merchants)
        .where(and(eq(merchants.accountId, row.accountId), isNull(merchants.suspendedAt)))
    )[0]?.n ?? 0;
  const limit = shopLimit(row.plan);
  if (activeCount >= limit) {
    return errorResponse(
      'shop_limit',
      `Your plan allows ${limit} active workspace${limit === 1 ? '' : 's'}. Upgrade to reactivate more.`,
    );
  }
  await db
    .update(merchants)
    .set({ suspendedAt: null, updatedAt: new Date() })
    .where(eq(merchants.id, parsed.data.merchantId));
  return jsonResponse({ ok: true });
}

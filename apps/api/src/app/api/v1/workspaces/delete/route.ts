import { and, eq, isNull, ne } from 'drizzle-orm';
import { accounts, merchants } from '@lumina/db';
import { DeleteWorkspaceSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import {
  deleteWorkspace,
  WorkspaceDeleteError,
  type DeleteWorkspaceFailure,
} from '@/lib/account/delete-workspace';
import { type MerchantPurgeStorage } from '@/lib/account/purge';
import { createR2FromEnv } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Map a refusal reason to the right error envelope. */
const FAILURE_CODE: Record<DeleteWorkspaceFailure, 'not_found' | 'invalid_input'> = {
  not_found: 'not_found',
  last_active: 'invalid_input',
  has_subscription: 'invalid_input',
};

/**
 * POST /v1/workspaces/delete — permanently delete one of the account's workspaces. Account-owner only.
 * Never the last active workspace, never the workspace holding the live Stripe subscription (see
 * {@link deleteWorkspace}). If the deleted workspace was the active one, returns which sibling to switch
 * into so the dashboard can move the cookie.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = DeleteWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid request');
  }
  const targetId = parsed.data.merchantId;

  // Resolve the target's owning account and require the caller is the ACCOUNT owner (governs billing +
  // workspace lifecycle) — not merely a member of the target workspace.
  const [acc] = await guard.db
    .select({ id: accounts.id, ownerUserId: accounts.ownerUserId })
    .from(merchants)
    .innerJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, targetId))
    .limit(1);
  if (!acc) {
    return errorResponse('not_found', 'Workspace not found');
  }
  if (acc.ownerUserId !== guard.user.id) {
    return errorResponse('unauthorized', 'Only the account owner can delete a workspace');
  }

  const r2 = createR2FromEnv(process.env);
  const storage: MerchantPurgeStorage = r2 ?? { deleteByPrefix: async () => 0 };
  try {
    await deleteWorkspace(guard.db, storage, { merchantId: targetId, accountId: acc.id });
  } catch (err) {
    if (err instanceof WorkspaceDeleteError) {
      return errorResponse(FAILURE_CODE[err.reason], err.message);
    }
    throw err;
  }

  // If the active workspace was the one just deleted, tell the dashboard which active sibling to switch to.
  let activeMerchantReset: string | null = null;
  if (targetId === guard.merchantId) {
    const [next] = await guard.db
      .select({ id: merchants.id })
      .from(merchants)
      .where(
        and(eq(merchants.accountId, acc.id), isNull(merchants.suspendedAt), ne(merchants.id, targetId)),
      )
      .limit(1);
    activeMerchantReset = next?.id ?? null;
  }

  return jsonResponse({ ok: true, ...(activeMerchantReset ? { activeMerchantReset } : {}) });
}

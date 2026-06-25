import { and, eq, sql } from 'drizzle-orm';
import { memberships, merchants } from '@lumina/db';
import { MerchantUpdateSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, noContent } from '@/lib/http';
import { updateMerchantName } from '@/lib/account/service';
import { purgeMerchant, type MerchantPurgeStorage } from '@/lib/account/purge';
import { createR2FromEnv } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PUT /v1/merchant — update the active merchant's editable fields (name) (§6.3). */
export async function PUT(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = MerchantUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid merchant update');
  }
  const ok = await updateMerchantName(guard.db, guard.merchantId, parsed.data.name);
  if (!ok) {
    return errorResponse('not_found', 'Merchant not found');
  }
  const [row] = await guard.db
    .select({ id: merchants.id, name: merchants.name, slug: merchants.slug })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  return jsonResponse(row);
}

/** DELETE /v1/merchant — owner-only GDPR erasure of the workspace + all its data (§9). */
export async function DELETE(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const [membership] = await guard.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.merchantId, guard.merchantId), eq(memberships.userId, guard.user.id)),
    )
    .limit(1);
  if (membership?.role !== 'owner') {
    return errorResponse('unauthorized', 'Only the workspace owner can delete it');
  }

  // This endpoint closes the whole account (deletes the workspace + signs the user out). When the account
  // owns more than one workspace, blindly nuking the active one could strand billing on a sibling — require
  // the extras to be deleted individually first (POST /v1/workspaces/delete, which guards that path).
  const [active] = await guard.db
    .select({ accountId: merchants.accountId })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  if (active?.accountId) {
    const [{ count } = { count: 1 }] = await guard.db
      .select({ count: sql<number>`count(*)::int` })
      .from(merchants)
      .where(eq(merchants.accountId, active.accountId));
    if (count > 1) {
      return errorResponse(
        'invalid_input',
        'This account has other workspaces. Delete them from the workspace switcher first.',
      );
    }
  }

  const r2 = createR2FromEnv(process.env);
  const storage: MerchantPurgeStorage = r2 ?? { deleteByPrefix: async () => 0 };
  await purgeMerchant(guard.db, storage, guard.merchantId);
  return noContent();
}

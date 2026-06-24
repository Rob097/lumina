import { eq } from 'drizzle-orm';
import { merchants } from '@lumina/db';
import { CreateWorkspaceSchema, type MeMerchant } from '@lumina/shared';
import { createWorkspace } from '@/lib/bootstrap';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /v1/workspaces — create another workspace for the current user (multi-workspace). The user becomes
 * its owner. Returns the new workspace as a `MeMerchant`; the dashboard then sets the `active_merchant`
 * cookie to switch into it.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return errorResponse('unauthorized', 'Not authenticated');
  }
  const parsed = CreateWorkspaceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Enter a workspace name (1–80 characters).');
  }
  const db = getDb();
  const { merchantId } = await createWorkspace(db, { userId: user.id, name: parsed.data.name });
  const [m] = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      slug: merchants.slug,
      plan: merchants.plan,
      creditsBalance: merchants.creditsBalance,
    })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  const body: MeMerchant = {
    id: merchantId,
    name: m?.name ?? parsed.data.name,
    slug: m?.slug ?? '',
    role: 'owner',
    plan: m?.plan ?? 'free',
    creditsBalance: m?.creditsBalance ?? 0,
  };
  return jsonResponse(body, { status: 201 });
}

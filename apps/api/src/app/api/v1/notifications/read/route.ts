import { MarkReadRequestSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { markRead } from '@/lib/notifications/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /v1/notifications/read — mark the given ids (or all) as read for the session member. */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = MarkReadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Provide ids or all:true');
  }
  await markRead(guard.db, {
    userId: guard.user.id,
    merchantId: guard.merchantId,
    ids: parsed.data.ids,
    all: parsed.data.all,
  });
  return jsonResponse({ ok: true });
}

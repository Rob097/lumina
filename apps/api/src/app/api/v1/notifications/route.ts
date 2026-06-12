import { requireMerchant } from '@/lib/guard';
import { jsonResponse } from '@/lib/http';
import { listNotifications } from '@/lib/notifications/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/notifications — the session member's recent notifications + unread count (for the bell). */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const result = await listNotifications(guard.db, {
    userId: guard.user.id,
    merchantId: guard.merchantId,
  });
  return jsonResponse(result);
}

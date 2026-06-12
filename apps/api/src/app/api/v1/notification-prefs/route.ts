import { NotificationPrefsSchema } from '@lumina/shared';
import { z } from 'zod';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getPrefs, setPrefs } from '@/lib/notifications/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBody = z.object({ prefs: NotificationPrefsSchema });

/** GET /v1/notification-prefs — effective notification preferences for the session member. */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const prefs = await getPrefs(guard.db, { userId: guard.user.id, merchantId: guard.merchantId });
  return jsonResponse({ prefs });
}

/** PUT /v1/notification-prefs — replace the session member's preference overrides. */
export async function PUT(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = PutBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid notification preferences');
  }
  const prefs = await setPrefs(guard.db, {
    userId: guard.user.id,
    merchantId: guard.merchantId,
    prefs: parsed.data.prefs,
  });
  return jsonResponse({ prefs });
}

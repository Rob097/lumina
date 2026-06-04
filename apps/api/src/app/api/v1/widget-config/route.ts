import { WidgetSettingsSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getWidgetSettings, saveWidgetSettings } from '@/lib/widget-config/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/widget-config — the active widget settings for the session's merchant (§6.3). */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const settings = await getWidgetSettings(guard.db, guard.merchantId);
  return jsonResponse(settings);
}

/** PUT /v1/widget-config — replace the active widget settings (last write wins). */
export async function PUT(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = WidgetSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid widget settings');
  }
  const settings = await saveWidgetSettings(guard.db, guard.merchantId, parsed.data);
  return jsonResponse(settings);
}

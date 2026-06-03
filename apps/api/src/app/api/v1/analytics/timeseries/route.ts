import { TimeseriesIntervalSchema, TimeseriesResponseSchema } from '@lumina/shared';
import { getActiveMerchantId } from '@/lib/auth';
import { parseRange, timeseries } from '@/lib/analytics/service';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/analytics/timeseries?interval&from&to — generations + CTA series for the chart (§6.3). */
export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return errorResponse('unauthorized', 'Not authenticated');
  }
  const db = getDb();
  const merchantId = await getActiveMerchantId(db, user.id);
  if (!merchantId) {
    return errorResponse('not_found', 'No merchant for this account');
  }
  const url = new URL(req.url);
  const interval = TimeseriesIntervalSchema.catch('day').parse(url.searchParams.get('interval'));
  const range = parseRange(url);
  const data = await timeseries(db, merchantId, { ...range, interval });
  return jsonResponse(TimeseriesResponseSchema.parse(data));
}

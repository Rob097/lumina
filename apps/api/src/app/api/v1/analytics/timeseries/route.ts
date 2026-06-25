import { TimeseriesIntervalSchema, TimeseriesResponseSchema, canUseAnalytics } from '@lumina/shared';
import { resolveAccountPlan } from '@/lib/account/plan';
import { parseRange, timeseries } from '@/lib/analytics/service';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/analytics/timeseries?interval&from&to — generations + CTA series for the chart (§6.3). Growth+ only. */
export async function GET(req: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  if (!canUseAnalytics(await resolveAccountPlan(guard.db, guard.merchantId))) {
    return errorResponse('plan_required', 'Analytics is available on the Growth plan and above.');
  }
  const url = new URL(req.url);
  const interval = TimeseriesIntervalSchema.catch('day').parse(url.searchParams.get('interval'));
  const range = parseRange(url);
  const data = await timeseries(guard.db, guard.merchantId, { ...range, interval });
  return jsonResponse(TimeseriesResponseSchema.parse(data));
}

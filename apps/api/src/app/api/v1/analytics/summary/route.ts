import { AnalyticsSummarySchema, canUseAnalytics } from '@lumina/shared';
import { resolveAccountPlan } from '@/lib/account/plan';
import { parseRange, summary } from '@/lib/analytics/service';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/analytics/summary?from&to — KPIs + top products for the active merchant (§6.3). Growth+ only. */
export async function GET(req: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  if (!canUseAnalytics(await resolveAccountPlan(guard.db, guard.merchantId))) {
    return errorResponse('plan_required', 'Analytics is available on the Growth plan and above.');
  }
  const range = parseRange(new URL(req.url));
  const data = await summary(guard.db, guard.merchantId, range);
  return jsonResponse(AnalyticsSummarySchema.parse(data));
}

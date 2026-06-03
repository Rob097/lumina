import { AnalyticsSummarySchema } from '@lumina/shared';
import { getActiveMerchantId } from '@/lib/auth';
import { parseRange, summary } from '@/lib/analytics/service';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/analytics/summary?from&to — KPIs + top products for the active merchant (§6.3). */
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
  const range = parseRange(new URL(req.url));
  const data = await summary(db, merchantId, range);
  return jsonResponse(AnalyticsSummarySchema.parse(data));
}

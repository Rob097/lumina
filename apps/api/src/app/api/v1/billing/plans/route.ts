import { eq } from 'drizzle-orm';
import { merchants } from '@lumina/db';
import { buildBillingPlans } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/billing/plans — plan cards + the merchant's current tier (§6.3). */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const [row] = await guard.db
    .select({ plan: merchants.plan })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  if (!row) {
    return errorResponse('not_found', 'Merchant not found');
  }
  return jsonResponse(buildBillingPlans(row.plan));
}

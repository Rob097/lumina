import { CreditsResponseSchema } from '@lumina/shared';
import { getCreditsView } from '@/lib/credits/service';
import { requireMerchant } from '@/lib/guard';
import { jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/credits — balance + ledger for the session's active merchant (§6.3). */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const view = await getCreditsView(guard.db, guard.merchantId);
  return jsonResponse(CreditsResponseSchema.parse(view));
}

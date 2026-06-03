import { CreditsResponseSchema } from '@lumina/shared';
import { getActiveMerchantId } from '@/lib/auth';
import { getCreditsView } from '@/lib/credits/service';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/credits — balance + ledger for the session's active merchant (§6.3). */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return errorResponse('unauthorized', 'Not authenticated');
  }
  const db = getDb();
  const merchantId = await getActiveMerchantId(db, user.id);
  if (!merchantId) {
    return errorResponse('not_found', 'No merchant for this account');
  }
  const view = await getCreditsView(db, merchantId);
  return jsonResponse(CreditsResponseSchema.parse(view));
}

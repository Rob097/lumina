import { TeamResponseSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { jsonResponse } from '@/lib/http';
import { listTeam } from '@/lib/account/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/team — members of the session's active merchant (§6.3). */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const members = await listTeam(guard.db, guard.merchantId);
  return jsonResponse(TeamResponseSchema.parse({ members }));
}

import {
  ClientInputSchema,
  type ClientsListResponse,
  type ClientsWithStatsListResponse,
} from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { createClient, listClients, listClientsWithStats } from '@/lib/clients/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /v1/clients — the merchant's Studio client list (#8). With `?withStats=true`, each client carries
 * its render count + last activity (for the rubric + overview); otherwise the plain newest-first list.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const withStats = new URL(request.url).searchParams.get('withStats') === 'true';
  if (withStats) {
    const body: ClientsWithStatsListResponse = {
      clients: await listClientsWithStats(guard.db, guard.merchantId),
    };
    return jsonResponse(body);
  }
  const body: ClientsListResponse = { clients: await listClients(guard.db, guard.merchantId) };
  return jsonResponse(body);
}

/** POST /v1/clients — create a client. */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = ClientInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid client');
  }
  const client = await createClient(guard.db, guard.merchantId, parsed.data);
  return jsonResponse(client, { status: 201 });
}

import { ClientInputSchema, type ClientsListResponse } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { createClient, listClients } from '@/lib/clients/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/clients — the merchant's Studio client list (#8), newest-first. */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const clients = await listClients(guard.db, guard.merchantId);
  const body: ClientsListResponse = { clients };
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

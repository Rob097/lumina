import { ClientUpdateSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { deleteClient, getClient, updateClient } from '@/lib/clients/service';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/clients/:id — a single client (for the Studio client detail page). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return errorResponse('not_found', 'Client not found');
  }
  const client = await getClient(guard.db, guard.merchantId, id);
  if (!client) {
    return errorResponse('not_found', 'Client not found');
  }
  return jsonResponse(client);
}

/** PUT /v1/clients/:id — update a client. */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return errorResponse('not_found', 'Client not found');
  }
  const parsed = ClientUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid client');
  }
  const client = await updateClient(guard.db, guard.merchantId, id, parsed.data);
  if (!client) {
    return errorResponse('not_found', 'Client not found');
  }
  return jsonResponse(client);
}

/** DELETE /v1/clients/:id — remove a client (their generations keep on file, client_id → null). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return errorResponse('not_found', 'Client not found');
  }
  const removed = await deleteClient(guard.db, guard.merchantId, id);
  if (!removed) {
    return errorResponse('not_found', 'Client not found');
  }
  return jsonResponse({ ok: true });
}

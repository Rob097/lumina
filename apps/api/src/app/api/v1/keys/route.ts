import { CreateKeyRequestSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { createKey, listKeys } from '@/lib/key-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  return jsonResponse(await listKeys(guard.db, guard.merchantId));
}

export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = CreateKeyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid key request');
  }
  const created = await createKey(guard.db, {
    merchantId: guard.merchantId,
    kind: parsed.data.kind,
    env: parsed.data.env,
  });
  // Raw key revealed once.
  return jsonResponse(created, { status: 201 });
}

import { eq } from 'drizzle-orm';
import { merchants } from '@lumina/db';
import { MerchantUpdateSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { updateMerchantName } from '@/lib/account/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PUT /v1/merchant — update the active merchant's editable fields (name) (§6.3). */
export async function PUT(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = MerchantUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid merchant update');
  }
  const ok = await updateMerchantName(guard.db, guard.merchantId, parsed.data.name);
  if (!ok) {
    return errorResponse('not_found', 'Merchant not found');
  }
  const [row] = await guard.db
    .select({ id: merchants.id, name: merchants.name, slug: merchants.slug })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  return jsonResponse(row);
}

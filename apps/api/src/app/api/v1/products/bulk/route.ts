import { BulkProductsInputSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { bulkUpsertProducts } from '@/lib/products/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /v1/products/bulk — upsert a batch (CSV import), keyed by external_id (§6.3). */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = BulkProductsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid product batch');
  }
  const result = await bulkUpsertProducts(guard.db, guard.merchantId, parsed.data.products);
  return jsonResponse(result);
}

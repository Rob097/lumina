import { ProductUpdateSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, noContent } from '@/lib/http';
import { archiveProduct, updateProduct } from '@/lib/products/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** PUT /v1/products/:id — update a product (merchant-scoped). */
export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  const parsed = ProductUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid product update');
  }
  const updated = await updateProduct(guard.db, guard.merchantId, id, parsed.data);
  if (!updated) {
    return errorResponse('not_found', 'Product not found');
  }
  return jsonResponse(updated);
}

/** DELETE /v1/products/:id — archive a product (soft delete). */
export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  const ok = await archiveProduct(guard.db, guard.merchantId, id);
  if (!ok) {
    return errorResponse('not_found', 'Product not found');
  }
  return noContent();
}

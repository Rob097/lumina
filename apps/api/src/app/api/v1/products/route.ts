import { ProductCategorySchema, ProductInputSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { enqueueProductImageProcess } from '@/lib/inngest/product-image';
import { createProduct, listProducts } from '@/lib/products/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/products — the merchant's catalog, filterable by category/search (§6.3). */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get('category');
  const category = categoryParam ? ProductCategorySchema.safeParse(categoryParam) : null;

  const result = await listProducts(guard.db, guard.merchantId, {
    category: category?.success ? category.data : undefined,
    search: url.searchParams.get('search') ?? undefined,
    includeArchived: url.searchParams.get('includeArchived') === 'true',
    limit: Number(url.searchParams.get('limit') ?? 100),
    offset: Number(url.searchParams.get('offset') ?? 0),
  });
  return jsonResponse(result);
}

/** POST /v1/products — create a product. */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = ProductInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid product');
  }
  const product = await createProduct(guard.db, guard.merchantId, parsed.data);
  await enqueueProductImageProcess(guard.merchantId, product.id); // eager cutout (best-effort, D63)
  return jsonResponse(product, { status: 201 });
}

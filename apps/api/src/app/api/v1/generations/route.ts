import { GenerationStatusSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { jsonResponse } from '@/lib/http';
import { generationImageDeps } from '@/lib/generations/images';
import { listGenerations } from '@/lib/generations/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/generations — the merchant's generations, newest-first, cursor-paginated (§6.3). */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const status = statusParam ? GenerationStatusSchema.safeParse(statusParam) : null;

  const result = await listGenerations(
    guard.db,
    guard.merchantId,
    {
      status: status?.success ? status.data : undefined,
      productId: url.searchParams.get('productId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
    },
    generationImageDeps(),
  );
  return jsonResponse(result);
}

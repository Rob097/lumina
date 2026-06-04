import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { generationImageDeps } from '@/lib/generations/images';
import { getGeneration } from '@/lib/generations/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/generations/:id — full detail for the before/after view (§6.3). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  const detail = await getGeneration(guard.db, guard.merchantId, id, generationImageDeps(1280));
  if (!detail) {
    return errorResponse('not_found', 'Generation not found');
  }
  return jsonResponse(detail);
}

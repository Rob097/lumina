import { requireMerchant } from '@/lib/guard';
import { errorResponse, noContent } from '@/lib/http';
import { revokeKey } from '@/lib/key-service';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  const revoked = await revokeKey(guard.db, guard.merchantId, id);
  return revoked ? noContent() : errorResponse('not_found', 'Key not found');
}

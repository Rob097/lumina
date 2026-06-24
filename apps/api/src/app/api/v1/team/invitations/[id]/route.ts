import { requireMerchant } from '@/lib/guard';
import { errorResponse, noContent } from '@/lib/http';
import { revokeInvitation } from '@/lib/account/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** DELETE /v1/team/invitations/:id — revoke a pending invite. Owner/admin/support only. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.role === 'member') {
    return errorResponse('unauthorized', 'Only owners and admins can manage invitations.');
  }
  const { id } = await params;
  const ok = await revokeInvitation(guard.db, guard.merchantId, id);
  if (!ok) {
    return errorResponse('not_found', 'Invitation not found or already handled.');
  }
  return noContent();
}

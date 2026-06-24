import { AcceptInviteSchema } from '@lumina/shared';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';
import { acceptInvitation } from '@/lib/account/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASON_MESSAGE: Record<string, string> = {
  invalid: 'This invitation link is invalid.',
  expired: 'This invitation has expired. Ask for a new one.',
  revoked: 'This invitation was revoked.',
};

/**
 * POST /v1/team/invitations/accept — the invited user (now signed in) accepts via their token. Adds them
 * to the workspace; the dashboard then switches into it by setting the active_merchant cookie.
 */
export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return errorResponse('unauthorized', 'Sign in to accept the invitation.');
  }
  const parsed = AcceptInviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Missing invitation token.');
  }
  const res = await acceptInvitation(getDb(), { token: parsed.data.token, userId: user.id });
  if (!res.ok) {
    return errorResponse('invalid_input', REASON_MESSAGE[res.reason] ?? 'Could not accept the invite.');
  }
  return jsonResponse({ merchantId: res.merchantId });
}

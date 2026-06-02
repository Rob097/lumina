import { ensureMerchantForUser } from '@/lib/bootstrap';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Idempotent first-login bootstrap. The dashboard calls this right after a session is established.
 * On the created path it returns the four default key pairs' raw values once.
 */
export async function POST(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return errorResponse('unauthorized', 'Not authenticated');
  }
  const result = await ensureMerchantForUser(getDb(), { userId: user.id, email: user.email });
  return jsonResponse(result, { status: result.created ? 201 : 200 });
}

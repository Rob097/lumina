import { MeResponseSchema } from '@lumina/shared';
import { resolveSessionMerchants } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return errorResponse('unauthorized', 'Not authenticated');
  }
  const merchants = await resolveSessionMerchants(getDb(), user.id);
  return jsonResponse(MeResponseSchema.parse({ user, merchants }));
}

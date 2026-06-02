import type { Database } from '@lumina/db';
import { getActiveMerchantId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { getSessionUser, type SessionUser } from '@/lib/session';

export type Guarded =
  | { ok: true; user: SessionUser; db: Database; merchantId: string }
  | { ok: false; response: Response };

/** Require a Supabase session resolving to a merchant. Returns the error Response otherwise. */
export async function requireMerchant(): Promise<Guarded> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: errorResponse('unauthorized', 'Not authenticated') };
  }
  const db = getDb();
  const merchantId = await getActiveMerchantId(db, user.id);
  if (!merchantId) {
    return { ok: false, response: errorResponse('not_found', 'No merchant for this user') };
  }
  return { ok: true, user, db, merchantId };
}

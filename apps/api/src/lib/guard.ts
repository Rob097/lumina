import { cookies } from 'next/headers';
import type { Database } from '@lumina/db';
import type { MemberRole } from '@lumina/shared';
import { resolveActiveMembership } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { getSessionUser, type SessionUser } from '@/lib/session';

/** Cookie naming the user's active workspace (validated against memberships — never trusted blindly). */
export const ACTIVE_MERCHANT_COOKIE = 'active_merchant';

export type Guarded =
  | { ok: true; user: SessionUser; db: Database; merchantId: string; role: MemberRole }
  | { ok: false; response: Response };

/**
 * Require a Supabase session resolving to a merchant. Honors the `active_merchant` cookie (multi-workspace)
 * but only when the user is actually a member of that workspace; otherwise falls back to their first
 * membership. Returns the membership `role` so route handlers know "who's who" (e.g. the support account).
 */
export async function requireMerchant(): Promise<Guarded> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: errorResponse('unauthorized', 'Not authenticated') };
  }
  const db = getDb();
  const requested = (await cookies()).get(ACTIVE_MERCHANT_COOKIE)?.value ?? null;
  const active = await resolveActiveMembership(db, user.id, requested);
  if (!active) {
    return { ok: false, response: errorResponse('not_found', 'No merchant for this user') };
  }
  return { ok: true, user, db, merchantId: active.merchantId, role: active.role };
}

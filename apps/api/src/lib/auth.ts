import { and, eq } from 'drizzle-orm';
import { memberships, merchants, type Database } from '@lumina/db';
import {
  ERROR_CODES,
  type ErrorCode,
  type MeMerchant,
  type MemberRole,
  type PlanTier,
} from '@lumina/shared';
import { isAllowedOrigin } from './cors.js';
import { verifyKey } from './key-service.js';

/** Minimal reader implemented by both `Headers` and `URLSearchParams`. */
export interface KeyValueReader {
  get(name: string): string | null;
}

export interface ResolvedMerchant {
  id: string;
  plan: PlanTier;
  creditsBalance: number;
  allowedDomains: string[];
}

export type AuthResult =
  | { ok: true; merchantId: string; merchant: ResolvedMerchant; keyId: string }
  | { ok: false; error: ErrorCode };

async function loadMerchant(db: Database, merchantId: string): Promise<ResolvedMerchant | null> {
  const rows = await db
    .select({
      id: merchants.id,
      plan: merchants.plan,
      creditsBalance: merchants.creditsBalance,
      allowedDomains: merchants.allowedDomains,
    })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resolve a request authenticated by a publishable `site_key` (header `X-Lumina-Key` or `?site_key`).
 * Validates the key, then gates the request `Origin` against the merchant's allowed domains (§3.9).
 */
export async function resolveByPublishableKey(
  db: Database,
  input: { headers: KeyValueReader; query: KeyValueReader; origin: string | null },
): Promise<AuthResult> {
  const raw = input.headers.get('x-lumina-key') ?? input.query.get('site_key');
  if (!raw) {
    return { ok: false, error: ERROR_CODES.INVALID_KEY };
  }
  const verified = await verifyKey(db, raw);
  if (!verified || verified.kind !== 'publishable') {
    return { ok: false, error: ERROR_CODES.INVALID_KEY };
  }
  const merchant = await loadMerchant(db, verified.merchantId);
  if (!merchant) {
    return { ok: false, error: ERROR_CODES.INVALID_KEY };
  }
  if (!isAllowedOrigin(input.origin, merchant.allowedDomains)) {
    return { ok: false, error: ERROR_CODES.DOMAIN_NOT_ALLOWED };
  }
  return { ok: true, merchantId: merchant.id, merchant, keyId: verified.keyId };
}

/** Resolve a server-to-server request authenticated by a secret key (`Authorization: Bearer sk_…`). */
export async function resolveBySecretKey(
  db: Database,
  input: { headers: KeyValueReader },
): Promise<AuthResult> {
  const authHeader = input.headers.get('authorization');
  const raw =
    authHeader && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice('bearer '.length).trim()
      : null;
  if (!raw) {
    return { ok: false, error: ERROR_CODES.INVALID_KEY };
  }
  const verified = await verifyKey(db, raw);
  if (!verified || verified.kind !== 'secret') {
    return { ok: false, error: ERROR_CODES.INVALID_KEY };
  }
  const merchant = await loadMerchant(db, verified.merchantId);
  if (!merchant) {
    return { ok: false, error: ERROR_CODES.INVALID_KEY };
  }
  return { ok: true, merchantId: merchant.id, merchant, keyId: verified.keyId };
}

/**
 * Resolve the merchants a Supabase-authenticated user belongs to. The route handler authenticates the
 * session (verifies the JWT / cookie via @supabase/ssr) and passes the resolved `userId`.
 */
/** The merchant a session user acts on (first membership). Fallback when no active workspace is chosen. */
export async function getActiveMerchantId(db: Database, userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: memberships.merchantId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt)
    .limit(1);
  return rows[0]?.id ?? null;
}

export interface ActiveMembership {
  merchantId: string;
  role: MemberRole;
}

/**
 * Resolve which workspace a session user is acting on, for multi-workspace support. When `requestedId`
 * (the `active_merchant` cookie) names a workspace the user is actually a member of, that wins; otherwise
 * we fall back to their first membership. The cookie is NEVER trusted without this membership check
 * (tenant isolation, HARD RULE #1). Returns the membership role too, so callers know "who's who".
 */
export async function resolveActiveMembership(
  db: Database,
  userId: string,
  requestedId?: string | null,
): Promise<ActiveMembership | null> {
  if (requestedId) {
    const [m] = await db
      .select({ merchantId: memberships.merchantId, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.merchantId, requestedId)))
      .limit(1);
    if (m) return m;
  }
  const [first] = await db
    .select({ merchantId: memberships.merchantId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt)
    .limit(1);
  return first ?? null;
}

export async function resolveSessionMerchants(db: Database, userId: string): Promise<MeMerchant[]> {
  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      slug: merchants.slug,
      role: memberships.role,
      plan: merchants.plan,
      creditsBalance: merchants.creditsBalance,
    })
    .from(memberships)
    .innerJoin(merchants, eq(memberships.merchantId, merchants.id))
    .where(eq(memberships.userId, userId));
  return rows;
}

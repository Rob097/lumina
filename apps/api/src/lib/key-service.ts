import { and, eq, isNull } from 'drizzle-orm';
import { apiKeys, type Database } from '@lumina/db';
import type { ApiKeySummary, KeyEnv, KeyKind } from '@lumina/shared';
import { generateApiKey, hashApiKey, parseKey, prefixForKey, safeEqual } from './keys.js';

export interface CreateKeyInput {
  merchantId: string;
  kind: KeyKind;
  env: KeyEnv;
}

/** Create a key, persist only its hash + prefix, and return the raw value exactly once. */
export async function createKey(
  db: Database,
  input: CreateKeyInput,
): Promise<{ id: string; key: string }> {
  const generated = generateApiKey(input.kind, input.env);
  const rows = await db
    .insert(apiKeys)
    .values({
      merchantId: input.merchantId,
      kind: input.kind,
      env: input.env,
      prefix: generated.prefix,
      keyHash: generated.keyHash,
    })
    .returning({ id: apiKeys.id });
  const row = rows[0];
  if (!row) {
    throw new Error('failed to create api key');
  }
  return { id: row.id, key: generated.raw };
}

/** Safe, tenant-scoped list of keys (no secret/hash). */
export async function listKeys(db: Database, merchantId: string): Promise<ApiKeySummary[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.merchantId, merchantId))
    .orderBy(apiKeys.createdAt);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    env: r.env,
    prefix: r.prefix,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  }));
}

export interface VerifiedKey {
  merchantId: string;
  keyId: string;
  kind: KeyKind;
  env: KeyEnv;
}

/**
 * Verify a raw key: shape → prefix lookup → timing-safe hash compare → not revoked. On success bumps
 * `last_used_at` and returns the owning merchant. Returns null for anything invalid.
 */
export async function verifyKey(db: Database, raw: string): Promise<VerifiedKey | null> {
  const parsed = parseKey(raw);
  const prefix = prefixForKey(raw);
  if (!parsed || !prefix) {
    return null;
  }
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix)).limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) {
    return null;
  }
  if (!safeEqual(hashApiKey(raw), row.keyHash)) {
    return null;
  }
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return { merchantId: row.merchantId, keyId: row.id, kind: row.kind, env: row.env };
}

/** Revoke a key, scoped to the owning merchant. Returns false if not found / already revoked. */
export async function revokeKey(db: Database, merchantId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.merchantId, merchantId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

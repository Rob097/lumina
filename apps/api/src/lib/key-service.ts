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
      // A publishable key is public — keep its raw value as the site_key. Secret keys stay hash-only.
      siteKey: input.kind === 'publishable' ? generated.raw : null,
    })
    .returning({ id: apiKeys.id });
  const row = rows[0];
  if (!row) {
    throw new Error('failed to create api key');
  }
  return { id: row.id, key: generated.raw };
}

export interface RegeneratedKeys {
  publishable: { id: string; key: string };
  secret: { id: string; key: string };
}

/**
 * Replace the workspace's keys in one shot: revoke every active key, then mint a fresh live
 * publishable + secret. Returns both raw values exactly once. The publishable doubles as the public
 * `site_key`, so callers must warn the merchant their widget snippet needs updating after this.
 */
export async function regenerateLiveKeys(
  db: Database,
  merchantId: string,
): Promise<RegeneratedKeys> {
  return db.transaction(async (tx) => {
    await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.merchantId, merchantId), isNull(apiKeys.revokedAt)));

    const pub = generateApiKey('publishable', 'live');
    const sec = generateApiKey('secret', 'live');
    const rows = await tx
      .insert(apiKeys)
      .values([
        {
          merchantId,
          kind: 'publishable',
          env: 'live',
          prefix: pub.prefix,
          keyHash: pub.keyHash,
          siteKey: pub.raw, // publishable keys are public — store the raw value as the site_key
        },
        {
          merchantId,
          kind: 'secret',
          env: 'live',
          prefix: sec.prefix,
          keyHash: sec.keyHash,
          siteKey: null,
        },
      ])
      .returning({ id: apiKeys.id, kind: apiKeys.kind });

    const pubRow = rows.find((r) => r.kind === 'publishable');
    const secRow = rows.find((r) => r.kind === 'secret');
    if (!pubRow || !secRow) {
      throw new Error('failed to regenerate api keys');
    }
    return {
      publishable: { id: pubRow.id, key: pub.raw },
      secret: { id: secRow.id, key: sec.raw },
    };
  });
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
    siteKey: r.siteKey ?? null,
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

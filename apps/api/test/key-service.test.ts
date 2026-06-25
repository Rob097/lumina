import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { apiKeys, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createKey,
  listKeys,
  regenerateLiveKeys,
  revokeKey,
  verifyKey,
} from '../src/lib/key-service.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'KeyCo', slug: `keyco-${randomUUID()}` })
    .returning();
  return firstOrThrow(rows).id;
}

describe('key-service', () => {
  it('creates a key, returns the raw once, and stores only the hash', async () => {
    const merchantId = await newMerchant();
    const { id, key } = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'test' });

    expect(key).toMatch(/^pk_test_/);
    const row = firstOrThrow(await ctx.db.select().from(apiKeys).where(eq(apiKeys.id, id)));
    expect(row.keyHash).not.toContain(key); // raw never persisted
    expect(row.prefix.startsWith('pk_test_')).toBe(true);

    const summaries = await listKeys(ctx.db, merchantId);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).not.toHaveProperty('keyHash');
  });

  it('verifies a valid key and bumps last_used_at; rejects wrong/tampered keys', async () => {
    const merchantId = await newMerchant();
    const { key } = await createKey(ctx.db, { merchantId, kind: 'secret', env: 'live' });

    const verified = await verifyKey(ctx.db, key);
    expect(verified?.merchantId).toBe(merchantId);
    expect(verified?.kind).toBe('secret');

    expect(await verifyKey(ctx.db, 'sk_live_not_a_real_key')).toBeNull();
    // Same prefix, wrong secret -> hash mismatch.
    const tampered = `${key.slice(0, -3)}xyz`;
    expect(await verifyKey(ctx.db, tampered)).toBeNull();

    const row = firstOrThrow(
      await ctx.db.select().from(apiKeys).where(eq(apiKeys.merchantId, merchantId)),
    );
    expect(row.lastUsedAt).not.toBeNull();
  });

  it('revokes (tenant-scoped) so the key no longer verifies', async () => {
    const merchantId = await newMerchant();
    const otherMerchant = await newMerchant();
    const { id, key } = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'live' });

    // Another tenant cannot revoke this key.
    expect(await revokeKey(ctx.db, otherMerchant, id)).toBe(false);
    expect(await verifyKey(ctx.db, key)).not.toBeNull();

    expect(await revokeKey(ctx.db, merchantId, id)).toBe(true);
    expect(await verifyKey(ctx.db, key)).toBeNull();

    const summaries = await listKeys(ctx.db, merchantId);
    expect(firstOrThrow(summaries).revokedAt).not.toBeNull();
  });

  it('regenerates a fresh live pair, revoking every prior key', async () => {
    const merchantId = await newMerchant();
    // Start with an old pair (as a bootstrapped workspace would have).
    const oldPub = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'live' });
    const oldSec = await createKey(ctx.db, { merchantId, kind: 'secret', env: 'live' });

    const regenerated = await regenerateLiveKeys(ctx.db, merchantId);

    // New keys verify; old ones no longer do.
    expect(regenerated.publishable.key).toMatch(/^pk_live_/);
    expect(regenerated.secret.key).toMatch(/^sk_live_/);
    expect(await verifyKey(ctx.db, regenerated.publishable.key)).not.toBeNull();
    expect(await verifyKey(ctx.db, regenerated.secret.key)).not.toBeNull();
    expect(await verifyKey(ctx.db, oldPub.key)).toBeNull();
    expect(await verifyKey(ctx.db, oldSec.key)).toBeNull();

    // Exactly one active publishable + secret remain, and the publishable carries its site_key.
    const active = (await listKeys(ctx.db, merchantId)).filter((k) => !k.revokedAt);
    expect(active).toHaveLength(2);
    const pub = active.find((k) => k.kind === 'publishable');
    expect(pub?.env).toBe('live');
    expect(pub?.siteKey).toBe(regenerated.publishable.key);
  });

  it('exposes the raw value as the public site_key for publishable keys only', async () => {
    const merchantId = await newMerchant();
    const pub = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'live' });
    const sec = await createKey(ctx.db, { merchantId, kind: 'secret', env: 'live' });

    const summaries = await listKeys(ctx.db, merchantId);
    const pubSummary = summaries.find((s) => s.id === pub.id);
    const secSummary = summaries.find((s) => s.id === sec.id);

    // A publishable key IS the public site_key — returned in full so the install snippet self-fills.
    expect(pubSummary?.siteKey).toBe(pub.key);
    // A secret key is never exposed.
    expect(secSummary?.siteKey ?? null).toBeNull();
  });
});

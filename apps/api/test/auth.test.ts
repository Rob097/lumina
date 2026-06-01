import { randomUUID } from 'node:crypto';
import { memberships, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  resolveByPublishableKey,
  resolveBySecretKey,
  resolveSessionMerchants,
  type KeyValueReader,
} from '../src/lib/auth.js';
import { createKey } from '../src/lib/key-service.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

function reader(map: Record<string, string>): KeyValueReader {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower[name.toLowerCase()] ?? null };
}

async function merchantWithDomains(domains: string[]): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'AuthCo', slug: `authco-${randomUUID()}`, allowedDomains: domains })
    .returning();
  return firstOrThrow(rows).id;
}

describe('resolveByPublishableKey', () => {
  it('accepts a valid pk from an allowed origin', async () => {
    const merchantId = await merchantWithDomains(['shop.example.com']);
    const { key } = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'live' });

    const res = await resolveByPublishableKey(ctx.db, {
      headers: reader({ 'x-lumina-key': key }),
      query: reader({}),
      origin: 'https://shop.example.com',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.merchantId).toBe(merchantId);
    }
  });

  it('rejects a disallowed origin with domain_not_allowed', async () => {
    const merchantId = await merchantWithDomains(['shop.example.com']);
    const { key } = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'live' });

    const res = await resolveByPublishableKey(ctx.db, {
      headers: reader({ 'x-lumina-key': key }),
      query: reader({}),
      origin: 'https://evil.com',
    });
    expect(res).toEqual({ ok: false, error: 'domain_not_allowed' });
  });

  it('rejects a secret key used as publishable', async () => {
    const merchantId = await merchantWithDomains(['shop.example.com']);
    const { key } = await createKey(ctx.db, { merchantId, kind: 'secret', env: 'live' });

    const res = await resolveByPublishableKey(ctx.db, {
      headers: reader({ 'x-lumina-key': key }),
      query: reader({}),
      origin: 'https://shop.example.com',
    });
    expect(res).toEqual({ ok: false, error: 'invalid_key' });
  });

  it('reads the key from ?site_key as well', async () => {
    const merchantId = await merchantWithDomains(['shop.example.com']);
    const { key } = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'test' });

    const res = await resolveByPublishableKey(ctx.db, {
      headers: reader({}),
      query: reader({ site_key: key }),
      origin: 'https://shop.example.com',
    });
    expect(res.ok).toBe(true);
  });
});

describe('resolveBySecretKey', () => {
  it('accepts a Bearer sk_ key and rejects a pk', async () => {
    const merchantId = await merchantWithDomains([]);
    const secret = await createKey(ctx.db, { merchantId, kind: 'secret', env: 'live' });
    const publishable = await createKey(ctx.db, { merchantId, kind: 'publishable', env: 'live' });

    const ok = await resolveBySecretKey(ctx.db, {
      headers: reader({ authorization: `Bearer ${secret.key}` }),
    });
    expect(ok.ok).toBe(true);

    const bad = await resolveBySecretKey(ctx.db, {
      headers: reader({ authorization: `Bearer ${publishable.key}` }),
    });
    expect(bad).toEqual({ ok: false, error: 'invalid_key' });
  });
});

describe('resolveSessionMerchants', () => {
  it("returns the user's merchant memberships with role + plan", async () => {
    const userId = randomUUID();
    await ctx.sqlClient`insert into auth.users (id, email) values (${userId}::uuid, 'u@test.dev')`;
    const merchantId = await merchantWithDomains([]);
    await ctx.db.insert(memberships).values({ merchantId, userId, role: 'owner' });

    const list = await resolveSessionMerchants(ctx.db, userId);
    expect(list).toHaveLength(1);
    expect(list[0]?.role).toBe('owner');
    expect(list[0]?.id).toBe(merchantId);
  });
});

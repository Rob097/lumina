import { randomUUID } from 'node:crypto';
import { memberships, merchants } from '@lumina/db';
import { setupTestDb, firstOrThrow, type TestDb } from '@lumina/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  platformSupportUserIds,
  enrollPlatformSupport,
  syncPlatformSupport,
} from '../src/lib/account/platform-support.js';

let ctx: TestDb;
beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx?.teardown();
});

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@x.test`})`);
  return id;
}
async function newMerchant(): Promise<string> {
  return firstOrThrow(
    await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
  ).id;
}
async function roleOf(merchantId: string, userId: string): Promise<string | undefined> {
  const [r] = await ctx.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.merchantId, merchantId), eq(memberships.userId, userId)))
    .limit(1);
  return r?.role;
}

describe('platformSupportUserIds', () => {
  it('parses, trims, dedupes, and drops invalid UUIDs', () => {
    const a = randomUUID();
    const b = randomUUID();
    const env = { LUMINA_SUPPORT_USER_IDS: ` ${a}, ${b} ,${a}, not-a-uuid,` };
    expect(platformSupportUserIds(env)).toEqual([a, b]);
  });
  it('is empty when unset', () => {
    expect(platformSupportUserIds({})).toEqual([]);
  });
});

describe('enrollPlatformSupport', () => {
  it('enrolls each configured id as role=support, idempotently', async () => {
    const s1 = await newUser();
    const s2 = await newUser();
    const m = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${s1},${s2}` };
    expect(await enrollPlatformSupport(ctx.db, m, { env })).toBe(2);
    expect(await roleOf(m, s1)).toBe('support');
    expect(await roleOf(m, s2)).toBe('support');
    // idempotent — re-run inserts nothing new
    await enrollPlatformSupport(ctx.db, m, { env });
    const counted = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.merchantId, m));
    expect(counted[0]?.n).toBe(2);
  });

  it('skips excludeUserId (creator is support)', async () => {
    const s1 = await newUser();
    const m = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${s1}` };
    expect(await enrollPlatformSupport(ctx.db, m, { excludeUserId: s1, env })).toBe(0);
    expect(await roleOf(m, s1)).toBeUndefined();
  });

  it('is fail-safe: a configured id not in auth.users does not throw and does not block valid ids', async () => {
    const good = await newUser();
    const ghost = randomUUID(); // never inserted into auth.users → FK would fail
    const m = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${ghost},${good}` };
    const enrolled = await enrollPlatformSupport(ctx.db, m, { env });
    expect(enrolled).toBe(1);
    expect(await roleOf(m, good)).toBe('support');
    expect(await roleOf(m, ghost)).toBeUndefined();
  });

  it('no-op when unconfigured', async () => {
    const m = await newMerchant();
    expect(await enrollPlatformSupport(ctx.db, m, { env: {} })).toBe(0);
  });
});

describe('syncPlatformSupport', () => {
  it('backfills support membership into every existing merchant and is idempotent', async () => {
    const s1 = await newUser();
    const m1 = await newMerchant();
    const m2 = await newMerchant();
    const env = { LUMINA_SUPPORT_USER_IDS: `${s1}` };
    const res = await syncPlatformSupport(ctx.db, { env });
    expect(res.supportIds).toEqual([s1]);
    expect(await roleOf(m1, s1)).toBe('support');
    expect(await roleOf(m2, s1)).toBe('support');
    // idempotent
    await syncPlatformSupport(ctx.db, { env });
    expect(await roleOf(m1, s1)).toBe('support');
  });
});

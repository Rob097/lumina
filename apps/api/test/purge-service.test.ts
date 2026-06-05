import { randomUUID } from 'node:crypto';
import { creditLedger, generations, merchants, products } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeGenerationsOlderThan, purgeMerchant } from '../src/lib/account/purge.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(): Promise<string> {
  return firstOrThrow(
    await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
  ).id;
}

async function seed(merchantId: string, createdAt = new Date()): Promise<string> {
  await ctx.db
    .insert(products)
    .values({ merchantId, name: 'P', category: 'lighting', imageUrl: 'https://s/p.png' });
  const genId = firstOrThrow(
    await ctx.db
      .insert(generations)
      .values({
        merchantId,
        roomKey: `rooms/${merchantId}/r.jpg`,
        resultKey: `results/${merchantId}/g.jpg`,
        productSnapshot: { name: 'P', category: 'lighting', imageUrl: 'https://s/p.png' },
        idempotencyKey: randomUUID(),
        status: 'succeeded',
        createdAt,
      })
      .returning({ id: generations.id }),
  ).id;
  await ctx.db.insert(creditLedger).values({ merchantId, amount: -1, reason: 'generation', generationId: genId });
  return genId;
}

describe('purgeMerchant (GDPR erasure)', () => {
  it('deletes the merchant + all its data and storage objects, leaving other tenants intact', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    await seed(a);
    await seed(b);

    const prefixes: string[] = [];
    const storage = {
      deleteByPrefix: async (p: string) => {
        prefixes.push(p);
        return 1;
      },
    };

    const res = await purgeMerchant(ctx.db, storage, a);
    expect(res.objectsDeleted).toBe(3);
    expect(prefixes.sort()).toEqual([`products/${a}/`, `results/${a}/`, `rooms/${a}/`]);

    expect(await ctx.db.select().from(merchants).where(eq(merchants.id, a))).toHaveLength(0);
    expect(await ctx.db.select().from(products).where(eq(products.merchantId, a))).toHaveLength(0);
    expect(await ctx.db.select().from(generations).where(eq(generations.merchantId, a))).toHaveLength(0);

    // tenant B untouched
    expect(await ctx.db.select().from(merchants).where(eq(merchants.id, b))).toHaveLength(1);
    expect(await ctx.db.select().from(generations).where(eq(generations.merchantId, b))).toHaveLength(1);
  });
});

describe('purgeGenerationsOlderThan (retention)', () => {
  it('deletes generations + their objects past the window, preserving the ledger', async () => {
    const m = await newMerchant();
    const old = await seed(m, new Date('2026-01-01T00:00:00Z'));
    const recent = await seed(m, new Date());

    const deleted: string[] = [];
    const storage = { deleteObject: async (k: string) => void deleted.push(k) };

    const res = await purgeGenerationsOlderThan(ctx.db, storage, {
      olderThanDays: 90,
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(res.generations).toBe(1);
    expect(res.objects).toBe(2); // room + result
    expect(deleted.some((k) => k.includes('rooms/'))).toBe(true);

    expect(await ctx.db.select().from(generations).where(eq(generations.id, old))).toHaveLength(0);
    expect(await ctx.db.select().from(generations).where(eq(generations.id, recent))).toHaveLength(1);

    // ledger row survived (generation_id set null), so the balance math is untouched
    const sum =
      await ctx.sqlClient`select coalesce(sum(amount),0)::int as s from credit_ledger where merchant_id = ${m}::uuid`;
    expect(sum[0]?.s).toBe(-2);
    // the old generation's ledger row was nulled, not deleted
    const nulled = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.merchantId, m));
    expect(nulled[0]?.n).toBe(2);
  });
});

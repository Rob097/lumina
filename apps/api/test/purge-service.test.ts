import { randomUUID } from 'node:crypto';
import { creditLedger, generations, merchants, products } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeExpiredAssets, purgeMerchant } from '../src/lib/account/purge.js';

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
        thumbKey: `thumbs/${merchantId}/g.webp`,
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
    expect(res.objectsDeleted).toBe(4);
    expect(prefixes.sort()).toEqual([
      `products/${a}/`,
      `results/${a}/`,
      `rooms/${a}/`,
      `thumbs/${a}/`,
    ]);

    expect(await ctx.db.select().from(merchants).where(eq(merchants.id, a))).toHaveLength(0);
    expect(await ctx.db.select().from(products).where(eq(products.merchantId, a))).toHaveLength(0);
    expect(await ctx.db.select().from(generations).where(eq(generations.merchantId, a))).toHaveLength(0);

    // tenant B untouched
    expect(await ctx.db.select().from(merchants).where(eq(merchants.id, b))).toHaveLength(1);
    expect(await ctx.db.select().from(generations).where(eq(generations.merchantId, b))).toHaveLength(1);
  });
});

describe('purgeExpiredAssets (tiered retention)', () => {
  const day = 86_400_000;
  const now = new Date('2026-06-01T00:00:00Z');

  it('purges room + result originals past their windows, preserving the row, ledger and thumbnail', async () => {
    const m = await newMerchant();
    const oldGen = await seed(m, new Date(now.getTime() - 150 * day)); // both windows passed
    const midGen = await seed(m, new Date(now.getTime() - 45 * day)); // room (>30d) yes, result (<90d) no
    const recent = await seed(m, new Date(now.getTime() - 5 * day)); // nothing

    const deleted: string[] = [];
    const storage = { deleteObject: async (k: string) => void deleted.push(k) };

    const res = await purgeExpiredAssets(ctx.db, storage, { roomDays: 30, resultDays: 90, now });
    expect(res.rooms).toBe(2); // old + mid
    expect(res.results).toBe(1); // old only
    expect(res.objects).toBe(3);
    expect(deleted.filter((k) => k.includes('rooms/'))).toHaveLength(2);
    expect(deleted.filter((k) => k.includes('results/'))).toHaveLength(1);
    expect(deleted.some((k) => k.includes('thumbs/'))).toBe(false); // the thumbnail is never purged

    // every row is preserved (history kept) — the purge deletes objects + flags, not rows
    for (const id of [oldGen, midGen, recent]) {
      expect(await ctx.db.select().from(generations).where(eq(generations.id, id))).toHaveLength(1);
    }
    const oldRow = firstOrThrow(
      await ctx.db.select().from(generations).where(eq(generations.id, oldGen)),
    );
    expect(oldRow.roomPurgedAt).not.toBeNull();
    expect(oldRow.originalsPurgedAt).not.toBeNull();
    expect(oldRow.thumbKey).toContain('thumbs/'); // thumbnail key kept for the dashboard

    const midRow = firstOrThrow(
      await ctx.db.select().from(generations).where(eq(generations.id, midGen)),
    );
    expect(midRow.roomPurgedAt).not.toBeNull();
    expect(midRow.originalsPurgedAt).toBeNull(); // result still within its window

    const recentRow = firstOrThrow(
      await ctx.db.select().from(generations).where(eq(generations.id, recent)),
    );
    expect(recentRow.roomPurgedAt).toBeNull();

    // ledger intact — three generation debits, rows preserved
    const sum =
      await ctx.sqlClient`select coalesce(sum(amount),0)::int as s from credit_ledger where merchant_id = ${m}::uuid`;
    expect(sum[0]?.s).toBe(-3);
    const count = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(creditLedger)
      .where(eq(creditLedger.merchantId, m));
    expect(count[0]?.n).toBe(3);
  });

  it('is idempotent — a second run finds nothing to purge', async () => {
    const m = await newMerchant();
    await seed(m, new Date(now.getTime() - 150 * day));
    const storage = { deleteObject: async () => {} };
    await purgeExpiredAssets(ctx.db, storage, { roomDays: 30, resultDays: 90, now });
    const second = await purgeExpiredAssets(ctx.db, storage, { roomDays: 30, resultDays: 90, now });
    expect(second).toEqual({ rooms: 0, results: 0, objects: 0 });
  });
});

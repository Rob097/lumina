import { randomUUID } from 'node:crypto';
import { generations, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { costSummary } from '../src/lib/generations/cost.js';

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

async function seedGen(
  merchantId: string,
  opts: { model?: string; costMicros?: number | null; status?: 'succeeded' | 'failed' } = {},
): Promise<void> {
  await ctx.db.insert(generations).values({
    merchantId,
    roomKey: `rooms/${merchantId}/r.jpg`,
    productSnapshot: { name: 'P', category: 'lighting', imageUrl: 'https://s/p.png' },
    idempotencyKey: randomUUID(),
    status: opts.status ?? 'succeeded',
    model: opts.model ?? 'google/gemini-3-pro-image',
    costMicros: opts.costMicros === undefined ? 139000 : opts.costMicros,
  });
}

describe('costSummary (real-cost margin aggregation)', () => {
  it('sums real micro-USD cost per model over succeeded generations only', async () => {
    const m = await newMerchant();
    await seedGen(m, { model: 'google/gemini-3-pro-image', costMicros: 139000 });
    await seedGen(m, { model: 'google/gemini-3-pro-image', costMicros: 139000 });
    await seedGen(m, { model: 'google/gemini-3.1-flash-image-preview', costMicros: 6000 });
    await seedGen(m, { status: 'failed', costMicros: 0 }); // excluded (not succeeded)
    await seedGen(m, { costMicros: null }); // excluded (no real cost captured)

    const res = await costSummary(ctx.db, { merchantId: m });
    expect(res.generations).toBe(3);
    expect(res.totalCostMicros).toBe(139000 + 139000 + 6000);
    expect(res.avgCostMicros).toBe(Math.round((139000 + 139000 + 6000) / 3));
    // sorted by cost desc — the quality model first
    expect(res.byModel[0]?.model).toBe('google/gemini-3-pro-image');
    expect(res.byModel[0]?.generations).toBe(2);
    expect(res.byModel[0]?.costMicros).toBe(278000);
  });

  it('returns a zeroed summary when there is nothing to aggregate', async () => {
    const m = await newMerchant();
    const res = await costSummary(ctx.db, { merchantId: m });
    expect(res).toEqual({ generations: 0, totalCostMicros: 0, avgCostMicros: 0, byModel: [] });
  });
});

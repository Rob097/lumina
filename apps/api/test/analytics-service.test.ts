import { randomUUID } from 'node:crypto';
import { generations, merchants, products, usageEvents } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import type { GenerationStatus, ProductCategory } from '@lumina/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { summary, timeseries } from '../src/lib/analytics/service.js';

let ctx: TestDb;
const RANGE = { from: new Date('2026-05-01T00:00:00Z'), to: new Date('2026-06-01T00:00:00Z') };

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Co', slug: `co-${randomUUID()}` })
    .returning();
  return firstOrThrow(rows).id;
}

async function event(merchantId: string, type: string, when = new Date('2026-05-10T12:00:00Z')) {
  await ctx.db.insert(usageEvents).values({ merchantId, type, createdAt: when });
}
async function newProduct(merchantId: string, name: string, category: ProductCategory) {
  const rows = await ctx.db
    .insert(products)
    .values({ merchantId, name, category, imageUrl: 'https://shop.test/p.png' })
    .returning();
  return firstOrThrow(rows).id;
}
async function gen(
  merchantId: string,
  productId: string | null,
  status: GenerationStatus,
  when = new Date('2026-05-10T12:00:00Z'),
) {
  await ctx.db.insert(generations).values({
    merchantId,
    productId,
    status,
    roomKey: 'rooms/x.jpg',
    productSnapshot: { name: 'P', category: 'lighting', imageUrl: 'https://shop.test/p.png' },
    idempotencyKey: randomUUID(),
    createdAt: when,
  });
}

describe('analytics summary', () => {
  it('counts events + generations, success rate, and top products (merchant-scoped)', async () => {
    const m = await newMerchant();
    const other = await newMerchant();
    const lamp = await newProduct(m, 'Aura Floor Lamp', 'lighting');
    const chair = await newProduct(m, 'Nube Chair', 'furniture');

    for (let i = 0; i < 10; i++) await event(m, 'impression');
    for (let i = 0; i < 4; i++) await event(m, 'open');
    for (let i = 0; i < 2; i++) await event(m, 'cta');
    // generations: lamp 3 (2 ok, 1 failed), chair 1 ok
    await gen(m, lamp, 'succeeded');
    await gen(m, lamp, 'succeeded');
    await gen(m, lamp, 'failed');
    await gen(m, chair, 'succeeded');
    // a different merchant's noise that must never leak
    await event(other, 'impression');
    await gen(other, null, 'succeeded');

    const s = await summary(ctx.db, m, RANGE);
    expect(s.impressions).toBe(10);
    expect(s.opens).toBe(4);
    expect(s.ctaClicks).toBe(2);
    expect(s.generations).toBe(4);
    expect(s.successRate).toBeCloseTo(3 / 4, 5);
    expect(s.topProducts[0]).toMatchObject({ name: 'Aura Floor Lamp', generations: 3 });
    expect(s.topProducts[0]?.successRate).toBeCloseTo(2 / 3, 5);
  });

  it('returns zeros for a merchant with no activity', async () => {
    const m = await newMerchant();
    const s = await summary(ctx.db, m, RANGE);
    expect(s).toMatchObject({ impressions: 0, opens: 0, generations: 0, ctaClicks: 0, successRate: 0 });
    expect(s.topProducts).toEqual([]);
  });
});

describe('analytics timeseries', () => {
  it('buckets generations + cta clicks by day', async () => {
    const m = await newMerchant();
    await gen(m, null, 'succeeded', new Date('2026-05-03T09:00:00Z'));
    await gen(m, null, 'succeeded', new Date('2026-05-03T18:00:00Z'));
    await gen(m, null, 'failed', new Date('2026-05-05T10:00:00Z'));
    await event(m, 'cta', new Date('2026-05-03T20:00:00Z'));

    const ts = await timeseries(ctx.db, m, { interval: 'day', ...RANGE });
    const may3 = ts.points.find((p) => p.t === '2026-05-03');
    const may5 = ts.points.find((p) => p.t === '2026-05-05');
    expect(may3).toMatchObject({ generations: 2, ctaClicks: 1 });
    expect(may5).toMatchObject({ generations: 1, ctaClicks: 0 });
  });
});

import { randomUUID } from 'node:crypto';
import { generations, merchants, type ProductSnapshot } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import type { GenerationStatus } from '@lumina/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getGeneration, listGenerations } from '../src/lib/generations/service.js';

let ctx: TestDb;

const deps = { imageUrl: async (key: string | null) => (key ? `https://cdn.test/${key}` : null) };

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Co', slug: `co-${randomUUID()}`, plan: 'growth' })
    .returning();
  return firstOrThrow(rows).id;
}

const snapshot: ProductSnapshot = {
  name: 'Aura Floor Lamp',
  category: 'lighting',
  imageUrl: 'https://shop.it/aura.png',
};

async function insertGen(
  merchantId: string,
  opts: { status?: GenerationStatus; createdAt?: Date; resultKey?: string | null } = {},
): Promise<string> {
  const rows = await ctx.db
    .insert(generations)
    .values({
      merchantId,
      status: opts.status ?? 'succeeded',
      roomKey: `rooms/${merchantId}/${randomUUID()}.jpg`,
      productSnapshot: snapshot,
      idempotencyKey: randomUUID(),
      resultKey: opts.resultKey === undefined ? `results/${merchantId}/r.jpg` : opts.resultKey,
      placementHint: 'floor',
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning({ id: generations.id });
  return firstOrThrow(rows).id;
}

describe('listGenerations', () => {
  it('lists newest-first with snapshot product info + derived image urls', async () => {
    const m = await newMerchant();
    await insertGen(m, { createdAt: new Date('2026-06-01T10:00:00Z') });
    await insertGen(m, { createdAt: new Date('2026-06-02T10:00:00Z') });

    const res = await listGenerations(ctx.db, m, {}, deps);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]?.createdAt).toContain('2026-06-02'); // newest first
    expect(res.items[0]?.productName).toBe('Aura Floor Lamp');
    expect(res.items[0]?.resultUrl).toContain('results/');
  });

  it('paginates with an opaque cursor', async () => {
    const m = await newMerchant();
    await insertGen(m, { createdAt: new Date('2026-06-01T10:00:00Z') });
    await insertGen(m, { createdAt: new Date('2026-06-02T10:00:00Z') });
    await insertGen(m, { createdAt: new Date('2026-06-03T10:00:00Z') });

    const page1 = await listGenerations(ctx.db, m, { limit: 2 }, deps);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listGenerations(ctx.db, m, { limit: 2, cursor: page1.nextCursor! }, deps);
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    const m = await newMerchant();
    await insertGen(m, { status: 'succeeded' });
    await insertGen(m, { status: 'failed', resultKey: null });

    const failed = await listGenerations(ctx.db, m, { status: 'failed' }, deps);
    expect(failed.items).toHaveLength(1);
    expect(failed.items[0]?.status).toBe('failed');
    expect(failed.items[0]?.resultUrl).toBeNull();
  });

  it('does not leak generations across tenants', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    await insertGen(a);
    expect((await listGenerations(ctx.db, b, {}, deps)).items).toHaveLength(0);
  });
});

describe('getGeneration', () => {
  it('returns the detail for the owning merchant', async () => {
    const m = await newMerchant();
    const id = await insertGen(m);
    const detail = await getGeneration(ctx.db, m, id, deps);
    expect(detail?.id).toBe(id);
    expect(detail?.placementHint).toBe('floor');
  });

  it('returns null for another tenant', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const id = await insertGen(a);
    expect(await getGeneration(ctx.db, b, id, deps)).toBeNull();
  });
});

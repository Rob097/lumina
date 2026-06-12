import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { generations, merchants, products } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createGeneration,
  InsufficientCreditsError,
  ProductNotFoundError,
  type GenerateDeps,
} from '../src/lib/generate/service.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(credits: number): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'GenCo', slug: `genco-${randomUUID()}`, creditsBalance: credits })
    .returning();
  return firstOrThrow(rows).id;
}

function deps(): GenerateDeps & { enqueued: number } {
  const d = {
    enqueued: 0,
    enqueue: vi.fn(async () => {
      d.enqueued += 1;
    }),
    signResult: vi.fn(async (key: string) => `https://signed/${key}`),
  };
  return d;
}

const inlineProduct = { name: 'Aura', imageUrl: 'https://shop.test/aura.png', category: 'lighting' as const };

async function balance(merchantId: string): Promise<number> {
  return firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
    .creditsBalance;
}

describe('createGeneration', () => {
  it('debits 1 credit, inserts a queued generation, and enqueues the workflow', async () => {
    const merchantId = await newMerchant(5);
    const d = deps();
    const result = await createGeneration(ctx.db, d, {
      merchantId,
      inlineProduct,
      roomKey: `rooms/${merchantId}/a.jpg`,
      placementHint: 'on the desk',
    });

    expect(result.status).toBe('queued');
    expect(result.cached).toBe(false);
    expect(await balance(merchantId)).toBe(4);
    expect(d.enqueued).toBe(1);

    const row = firstOrThrow(
      await ctx.db.select().from(generations).where(eq(generations.id, result.generationId)),
    );
    expect(row.status).toBe('queued');
    expect(row.productSnapshot.name).toBe('Aura');
  });

  it('collapses an in-flight duplicate onto the same row without a second debit', async () => {
    const merchantId = await newMerchant(5);
    const input = { merchantId, inlineProduct, roomKey: `rooms/${merchantId}/b.jpg` };

    const first = await createGeneration(ctx.db, deps(), input);
    const d2 = deps();
    const second = await createGeneration(ctx.db, d2, input);

    expect(second.generationId).toBe(first.generationId);
    expect(second.cached).toBe(false); // still queued, not a finished cache hit
    expect(d2.enqueued).toBe(0); // not re-enqueued
    expect(await balance(merchantId)).toBe(4); // debited once
  });

  it('returns an identical SUCCEEDED result for free (cache hit)', async () => {
    const merchantId = await newMerchant(5);
    const input = { merchantId, inlineProduct, roomKey: `rooms/${merchantId}/c.jpg` };
    const first = await createGeneration(ctx.db, deps(), input);

    await ctx.db
      .update(generations)
      .set({ status: 'succeeded', resultKey: `results/${merchantId}/${first.generationId}.jpg` })
      .where(eq(generations.id, first.generationId));

    const d = deps();
    const cached = await createGeneration(ctx.db, d, input);
    expect(cached.cached).toBe(true);
    expect(cached.status).toBe('succeeded');
    expect(cached.resultUrl).toContain('results/');
    expect(d.enqueued).toBe(0);
    expect(await balance(merchantId)).toBe(4); // no extra debit
  });

  it('throws InsufficientCreditsError and inserts no row when out of credits', async () => {
    const merchantId = await newMerchant(0);
    await expect(
      createGeneration(ctx.db, deps(), { merchantId, inlineProduct, roomKey: `rooms/${merchantId}/d.jpg` }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    const rows = await ctx.db.select().from(generations).where(eq(generations.merchantId, merchantId));
    expect(rows).toHaveLength(0);
  });

  it('resolves a registered product by its external SKU and stores the internal id', async () => {
    const merchantId = await newMerchant(5);
    const productRows = await ctx.db
      .insert(products)
      .values({
        merchantId,
        externalId: 'SKU-1234',
        name: 'Nube',
        category: 'furniture',
        imageUrl: 'https://shop.test/nube.png',
      })
      .returning();
    const internalId = firstOrThrow(productRows).id;

    const result = await createGeneration(ctx.db, deps(), {
      merchantId,
      productId: 'SKU-1234', // the merchant's SKU, exactly as the widget sends it
      roomKey: `rooms/${merchantId}/e.jpg`,
    });
    const row = firstOrThrow(
      await ctx.db
        .select()
        .from(generations)
        .where(and(eq(generations.id, result.generationId), eq(generations.merchantId, merchantId))),
    );
    expect(row.productId).toBe(internalId); // stored as the internal uuid FK, not the SKU
    expect(row.productSnapshot.name).toBe('Nube');
  });

  it('throws ProductNotFoundError for an unknown SKU (not a uuid-cast 500)', async () => {
    const merchantId = await newMerchant(5);
    await expect(
      createGeneration(ctx.db, deps(), {
        merchantId,
        productId: 'P-DOES-NOT-EXIST',
        roomKey: `rooms/${merchantId}/f.jpg`,
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe('low-credits notification', () => {
  function depsWithNotify(): GenerateDeps & { notified: { type: string; data?: unknown }[] } {
    const notified: { type: string; data?: unknown }[] = [];
    return {
      enqueue: vi.fn(async () => {}),
      signResult: vi.fn(async (k: string) => `https://signed/${k}`),
      notify: vi.fn(async (input) => {
        notified.push({ type: input.type, data: input.data });
      }),
      notified,
    };
  }

  it('fires exactly once as the balance crosses the threshold (21 → 20)', async () => {
    const merchantId = await newMerchant(21);
    const d = depsWithNotify();
    await createGeneration(ctx.db, d, { merchantId, inlineProduct, roomKey: `rooms/${merchantId}/lc1.jpg` });
    expect(d.notified).toEqual([{ type: 'low_credits', data: { balance: 20 } }]);
  });

  it('stays quiet above the threshold (30 → 29)', async () => {
    const merchantId = await newMerchant(30);
    const d = depsWithNotify();
    await createGeneration(ctx.db, d, { merchantId, inlineProduct, roomKey: `rooms/${merchantId}/lc2.jpg` });
    expect(d.notified).toHaveLength(0);
  });

  it('does not re-fire when already below the threshold (15 → 14)', async () => {
    const merchantId = await newMerchant(15);
    const d = depsWithNotify();
    await createGeneration(ctx.db, d, { merchantId, inlineProduct, roomKey: `rooms/${merchantId}/lc3.jpg` });
    expect(d.notified).toHaveLength(0);
  });
});

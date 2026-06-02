import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { generations, merchants, products } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createGeneration,
  InsufficientCreditsError,
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

  it('resolves a registered product by id (snapshot from the catalog)', async () => {
    const merchantId = await newMerchant(5);
    const productRows = await ctx.db
      .insert(products)
      .values({ merchantId, name: 'Nube', category: 'furniture', imageUrl: 'https://shop.test/nube.png' })
      .returning();
    const productId = firstOrThrow(productRows).id;

    const result = await createGeneration(ctx.db, deps(), {
      merchantId,
      productId,
      roomKey: `rooms/${merchantId}/e.jpg`,
    });
    const row = firstOrThrow(
      await ctx.db
        .select()
        .from(generations)
        .where(and(eq(generations.id, result.generationId), eq(generations.merchantId, merchantId))),
    );
    expect(row.productId).toBe(productId);
    expect(row.productSnapshot.name).toBe('Nube');
  });
});

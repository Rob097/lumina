import { randomUUID } from 'node:crypto';
import { AIOrchestrator, MockProvider } from '@lumina/ai';
import { eq } from 'drizzle-orm';
import { merchants, products } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processProductImage } from '../src/lib/inngest/product-image.js';
import type { StoragePort } from '../src/lib/inngest/workflow.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

const storage = (puts: string[]): StoragePort => ({
  getObject: async () => new Uint8Array([1]),
  presignDownload: async (k) => `https://signed/${k}`,
  putObject: async (k) => {
    puts.push(k);
  },
});

function orchestratorWith(removeBackground?: () => Promise<{ bytes: Uint8Array; contentType: string }>): AIOrchestrator {
  const provider = new MockProvider({ name: 'mock', model: 'mock-compose' });
  return new AIOrchestrator({
    chains: { quality: [provider], balanced: [provider], fast: [provider] },
    ...(removeBackground ? { bgRemoval: { removeBackground } } : {}),
  });
}

async function newProduct(): Promise<{ merchantId: string; productId: string }> {
  const merchantId = firstOrThrow(
    await ctx.db.insert(merchants).values({ name: 'PiCo', slug: `pi-${randomUUID()}`, creditsBalance: 10 }).returning(),
  ).id;
  const productId = firstOrThrow(
    await ctx.db
      .insert(products)
      .values({ merchantId, name: 'Aura', category: 'lighting', imageUrl: 'https://shop.test/a.png' })
      .returning(),
  ).id;
  return { merchantId, productId };
}

describe('processProductImage (eager cutout pre-compute)', () => {
  it('computes the cutout and caches it on the product', async () => {
    const { merchantId, productId } = await newProduct();
    const removeBackground = vi.fn(async () => ({ bytes: new Uint8Array([2, 2]), contentType: 'image/png' }));
    const puts: string[] = [];

    const outcome = await processProductImage(
      { db: ctx.db, orchestrator: orchestratorWith(removeBackground), storage: storage(puts) },
      { productId, merchantId },
    );

    expect(outcome).toBe('cached');
    expect(removeBackground).toHaveBeenCalledTimes(1);
    expect(puts.some((k) => k.startsWith(`products/${merchantId}/clean/`))).toBe(true);
    const cleanKey = firstOrThrow(await ctx.db.select().from(products).where(eq(products.id, productId))).cleanImageKey;
    expect(cleanKey).toMatch(new RegExp(`^products/${merchantId}/clean/`));
  });

  it('skips when the cutout is already cached (idempotent — no second removal call)', async () => {
    const { merchantId, productId } = await newProduct();
    await ctx.db.update(products).set({ cleanImageKey: `products/${merchantId}/clean/${productId}.png` }).where(eq(products.id, productId));
    const removeBackground = vi.fn(async () => ({ bytes: new Uint8Array([2]), contentType: 'image/png' }));

    const outcome = await processProductImage(
      { db: ctx.db, orchestrator: orchestratorWith(removeBackground), storage: storage([]) },
      { productId, merchantId },
    );

    expect(outcome).toBe('skipped');
    expect(removeBackground).not.toHaveBeenCalled();
  });

  it('no-ops when no bg-removal provider is configured', async () => {
    const { merchantId, productId } = await newProduct();
    const outcome = await processProductImage(
      { db: ctx.db, orchestrator: orchestratorWith(), storage: storage([]) },
      { productId, merchantId },
    );
    expect(outcome).toBe('noop');
    expect(firstOrThrow(await ctx.db.select().from(products).where(eq(products.id, productId))).cleanImageKey).toBeNull();
  });

  it('skips a product that does not belong to the merchant (tenant-scoped)', async () => {
    const { productId } = await newProduct();
    const outcome = await processProductImage(
      { db: ctx.db, orchestrator: orchestratorWith(async () => ({ bytes: new Uint8Array([1]), contentType: 'image/png' })), storage: storage([]) },
      { productId, merchantId: randomUUID() },
    );
    expect(outcome).toBe('skipped');
  });
});

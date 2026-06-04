import { randomUUID } from 'node:crypto';
import { merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import type { ProductInput } from '@lumina/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  archiveProduct,
  bulkUpsertProducts,
  createProduct,
  listProducts,
  updateProduct,
} from '../src/lib/products/service.js';

let ctx: TestDb;

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

function input(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: 'Aura Lamp',
    category: 'lighting',
    imageUrl: 'https://shop.it/aura.png',
    ...overrides,
  };
}

describe('createProduct + listProducts', () => {
  it('creates a product and lists it for the merchant', async () => {
    const m = await newMerchant();
    const p = await createProduct(ctx.db, m, input({ externalId: 'AURA' }));
    expect(p.id).toBeTruthy();
    expect(p.merchantId).toBe(m);
    expect(p.active).toBe(true);

    const list = await listProducts(ctx.db, m);
    expect(list.total).toBe(1);
    expect(list.products[0]?.name).toBe('Aura Lamp');
  });

  it('filters by category and search, scoped to the merchant', async () => {
    const m = await newMerchant();
    await createProduct(ctx.db, m, input({ name: 'Sofa Nube', category: 'furniture' }));
    await createProduct(ctx.db, m, input({ name: 'Floor Lamp', category: 'lighting' }));

    expect((await listProducts(ctx.db, m, { category: 'furniture' })).total).toBe(1);
    expect((await listProducts(ctx.db, m, { search: 'lamp' })).products).toHaveLength(1);
  });

  it('does not leak products across tenants', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    await createProduct(ctx.db, a, input());
    expect((await listProducts(ctx.db, b)).total).toBe(0);
  });
});

describe('updateProduct', () => {
  it('updates a field, scoped to the owning merchant', async () => {
    const m = await newMerchant();
    const p = await createProduct(ctx.db, m, input());
    const updated = await updateProduct(ctx.db, m, p.id, { name: 'Aura Lamp v2' });
    expect(updated?.name).toBe('Aura Lamp v2');
  });

  it('refuses to update another tenant’s product (returns null)', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const p = await createProduct(ctx.db, a, input());
    expect(await updateProduct(ctx.db, b, p.id, { name: 'hijack' })).toBeNull();
  });
});

describe('archiveProduct', () => {
  it('soft-deletes — hidden from the default list, visible with includeArchived', async () => {
    const m = await newMerchant();
    const p = await createProduct(ctx.db, m, input());
    expect(await archiveProduct(ctx.db, m, p.id)).toBe(true);
    expect((await listProducts(ctx.db, m)).total).toBe(0);
    expect((await listProducts(ctx.db, m, { includeArchived: true })).total).toBe(1);
  });
});

describe('bulkUpsertProducts', () => {
  it('inserts new rows, then updates by externalId on re-import', async () => {
    const m = await newMerchant();
    const first = await bulkUpsertProducts(ctx.db, m, [
      input({ externalId: 'SKU1', name: 'One' }),
      input({ externalId: 'SKU2', name: 'Two' }),
    ]);
    expect(first).toEqual({ created: 2, updated: 0 });

    const second = await bulkUpsertProducts(ctx.db, m, [
      input({ externalId: 'SKU1', name: 'One Renamed' }),
      input({ externalId: 'SKU3', name: 'Three' }),
    ]);
    expect(second).toEqual({ created: 1, updated: 1 });

    const list = await listProducts(ctx.db, m);
    expect(list.total).toBe(3);
    expect(list.products.find((p) => p.externalId === 'SKU1')?.name).toBe('One Renamed');
  });
});

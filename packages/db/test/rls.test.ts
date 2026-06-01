import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generations, memberships, merchants, products } from '../src/schema.js';
import { firstOrThrow, setupTestDb, type TestDb } from './harness.js';

let ctx: TestDb;
const userA = randomUUID();
const userB = randomUUID();
let merchantAId: string;
let merchantBId: string;

beforeAll(async () => {
  ctx = await setupTestDb();

  // Two auth users (created in the auth shim table by the privileged role).
  await ctx.sqlClient`insert into auth.users (id, email) values (${userA}::uuid, 'a@test.dev'), (${userB}::uuid, 'b@test.dev')`;

  merchantAId = firstOrThrow(
    await ctx.db.insert(merchants).values({ name: 'Alpha', slug: 'alpha' }).returning(),
  ).id;
  merchantBId = firstOrThrow(
    await ctx.db.insert(merchants).values({ name: 'Bravo', slug: 'bravo' }).returning(),
  ).id;

  await ctx.db.insert(memberships).values([
    { merchantId: merchantAId, userId: userA, role: 'owner' },
    { merchantId: merchantBId, userId: userB, role: 'owner' },
  ]);

  await ctx.db.insert(products).values([
    { merchantId: merchantAId, name: 'Alpha Chair', imageUrl: 'https://shop.test/a.png', category: 'furniture' },
    { merchantId: merchantBId, name: 'Bravo Lamp', imageUrl: 'https://shop.test/b.png', category: 'lighting' },
  ]);
});

afterAll(async () => {
  await ctx?.teardown();
});

describe('RLS tenant isolation', () => {
  it('an authenticated user reads only their own merchant’s products', async () => {
    const rows = await ctx.asUser(userA, (tx) => tx.select().from(products));
    expect(rows.map((p) => p.name)).toEqual(['Alpha Chair']);
  });

  it('a different tenant sees only their own rows', async () => {
    const rows = await ctx.asUser(userB, (tx) => tx.select().from(products));
    expect(rows.map((p) => p.name)).toEqual(['Bravo Lamp']);
  });

  it('cannot insert a product into another tenant (WITH CHECK)', async () => {
    await expect(
      ctx.asUser(userA, (tx) =>
        tx
          .insert(products)
          .values({
            merchantId: merchantBId,
            name: 'Smuggled',
            imageUrl: 'https://shop.test/x.png',
            category: 'decor',
          }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the privileged role (migrations/seed/public-API) bypasses RLS and sees all tenants', async () => {
    const all = await ctx.db.select().from(products);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('generations are tenant-isolated as well', async () => {
    await ctx.db.insert(generations).values({
      merchantId: merchantAId,
      roomKey: 'rooms/alpha/1.jpg',
      productSnapshot: { name: 'Alpha Chair', category: 'furniture', imageUrl: 'https://shop.test/a.png' },
      idempotencyKey: 'idem-alpha-1',
    });

    const seenByB = await ctx.asUser(userB, (tx) => tx.select().from(generations));
    expect(seenByB).toHaveLength(0);

    const seenByA = await ctx.asUser(userA, (tx) => tx.select().from(generations));
    expect(seenByA).toHaveLength(1);
  });
});

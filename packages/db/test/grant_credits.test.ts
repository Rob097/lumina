import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creditLedger, merchants } from '../src/schema.js';
import { firstOrThrow, setupTestDb, type TestDb } from './harness.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function createMerchant(balance: number): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Grant Co', slug: `grant-${randomUUID()}`, creditsBalance: balance })
    .returning();
  return firstOrThrow(rows).id;
}

describe('grant_credits()', () => {
  it('grants atomically: bumps the cache and appends a ledger row with the reason + ref', async () => {
    const id = await createMerchant(0);

    const result =
      await ctx.sqlClient`select grant_credits(${id}::uuid, 250, 'grant', 'sub_123') as balance`;
    expect(result[0]?.balance).toBe(250);

    const merchant = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, id)));
    expect(merchant.creditsBalance).toBe(250);

    const ledger = await ctx.db.select().from(creditLedger).where(eq(creditLedger.merchantId, id));
    expect(ledger).toHaveLength(1);
    expect(firstOrThrow(ledger).amount).toBe(250);
    expect(firstOrThrow(ledger).reason).toBe('grant');
    expect(firstOrThrow(ledger).stripeRef).toBe('sub_123');
  });

  it('keeps the cache equal to the ledger sum after grant + debit', async () => {
    const id = await createMerchant(0);
    await ctx.sqlClient`select grant_credits(${id}::uuid, 100, 'purchase', null)`;
    await ctx.sqlClient`select debit_credits(${id}::uuid, 1, null::uuid)`;

    const merchant = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, id)));
    const sum =
      await ctx.sqlClient`select coalesce(sum(amount), 0)::int as s from credit_ledger where merchant_id = ${id}::uuid`;
    expect(merchant.creditsBalance).toBe(99);
    expect(sum[0]?.s).toBe(99);
  });

  it('raises MERCHANT_NOT_FOUND for an unknown merchant', async () => {
    await expect(
      ctx.sqlClient`select grant_credits(${randomUUID()}::uuid, 10, 'grant', null)`,
    ).rejects.toThrow(/MERCHANT_NOT_FOUND/);
  });
});

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
    .values({ name: 'Acme', slug: `acme-${randomUUID()}`, creditsBalance: balance })
    .returning();
  return firstOrThrow(rows).id;
}

describe('debit_credits()', () => {
  it('debits atomically: decrements the cache and appends a -1 generation ledger row', async () => {
    const id = await createMerchant(5);

    const result = await ctx.sqlClient`select debit_credits(${id}::uuid, 1, null::uuid) as balance`;
    expect(result[0]?.balance).toBe(4);

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, id)),
    );
    expect(merchant.creditsBalance).toBe(4);

    const ledger = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.merchantId, id));
    expect(ledger).toHaveLength(1);
    expect(firstOrThrow(ledger).amount).toBe(-1);
    expect(firstOrThrow(ledger).reason).toBe('generation');
  });

  it('raises INSUFFICIENT_CREDITS and leaves the balance + ledger untouched', async () => {
    const id = await createMerchant(0);

    await expect(
      ctx.sqlClient`select debit_credits(${id}::uuid, 1, null::uuid)`,
    ).rejects.toThrow(/INSUFFICIENT_CREDITS/);

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, id)),
    );
    expect(merchant.creditsBalance).toBe(0);

    const ledger = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.merchantId, id));
    expect(ledger).toHaveLength(0);
  });

  it('never debits below zero even with a large amount', async () => {
    const id = await createMerchant(2);
    await expect(
      ctx.sqlClient`select debit_credits(${id}::uuid, 3, null::uuid)`,
    ).rejects.toThrow(/INSUFFICIENT_CREDITS/);
    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, id)),
    );
    expect(merchant.creditsBalance).toBe(2);
  });

  it('refund restores the balance so ledger sum and cache stay consistent (failed generation)', async () => {
    const id = await createMerchant(3);
    await ctx.sqlClient`select debit_credits(${id}::uuid, 1, null::uuid)`;

    // What the Inngest workflow does on terminal failure: +1 refund + restore the cache.
    await ctx.sqlClient.begin(async (tx) => {
      await tx`update merchants set credits_balance = credits_balance + 1 where id = ${id}::uuid`;
      await tx`insert into credit_ledger (merchant_id, amount, reason) values (${id}::uuid, 1, 'refund')`;
    });

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, id)),
    );
    expect(merchant.creditsBalance).toBe(3);

    const sum =
      await ctx.sqlClient`select coalesce(sum(amount), 0)::int as s from credit_ledger where merchant_id = ${id}::uuid`;
    expect(sum[0]?.s).toBe(0); // -1 (debit) + 1 (refund)
  });
});

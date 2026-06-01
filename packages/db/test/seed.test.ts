import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed, DEMO_GRANT, DEMO_SLUG } from '../src/seed.js';
import { apiKeys, creditLedger, merchants, products, widgetConfigs } from '../src/schema.js';
import { firstOrThrow, setupTestDb, type TestDb } from './harness.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

describe('runSeed()', () => {
  it('creates the demo merchant with keys, products, widget config, and a consistent credit grant', async () => {
    const result = await runSeed(ctx.db, ctx.sqlClient);
    expect(result.created).toBe(true);
    expect(result.keys).toHaveLength(4);
    // Only hashes are persisted — never the raw secret.
    const storedKeys = await ctx.db.select().from(apiKeys).where(eq(apiKeys.merchantId, result.merchantId));
    expect(storedKeys).toHaveLength(4);
    for (const k of storedKeys) {
      expect(k.keyHash).toMatch(/^[0-9a-f]{64}$/);
    }

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.slug, DEMO_SLUG)),
    );
    expect(merchant.creditsBalance).toBe(DEMO_GRANT);

    // Denormalized cache equals the ledger sum (the invariant debit_credits/refunds preserve).
    const ledgerSum =
      await ctx.sqlClient`select coalesce(sum(amount), 0)::int as s from credit_ledger where merchant_id = ${merchant.id}::uuid`;
    expect(ledgerSum[0]?.s).toBe(DEMO_GRANT);

    const prods = await ctx.db.select().from(products).where(eq(products.merchantId, merchant.id));
    expect(prods).toHaveLength(3);

    const activeConfig = await ctx.db
      .select()
      .from(widgetConfigs)
      .where(sql`${widgetConfigs.merchantId} = ${merchant.id} and ${widgetConfigs.isActive}`);
    expect(activeConfig).toHaveLength(1);
  });

  it('is idempotent: a second run is a no-op', async () => {
    const result = await runSeed(ctx.db, ctx.sqlClient);
    expect(result.created).toBe(false);
    const allKeys = await ctx.db.select().from(creditLedger);
    // Still exactly one grant row — the second run did not duplicate anything.
    expect(allKeys.filter((r) => r.reason === 'grant')).toHaveLength(1);
  });
});

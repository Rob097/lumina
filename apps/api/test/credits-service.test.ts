import { randomUUID } from 'node:crypto';
import { creditLedger, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import type { LedgerReason, PlanTier } from '@lumina/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCreditsView } from '../src/lib/credits/service.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(plan: PlanTier): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Co', slug: `co-${randomUUID()}`, plan })
    .returning();
  return firstOrThrow(rows).id;
}

async function entry(merchantId: string, amount: number, reason: LedgerReason): Promise<void> {
  await ctx.db.insert(creditLedger).values({ merchantId, amount, reason });
}

describe('getCreditsView', () => {
  it('returns balance = ledger sum, with plan included/used + ledger entries', async () => {
    const m = await newMerchant('growth');
    await entry(m, 1200, 'grant');
    await entry(m, -1, 'generation');
    await entry(m, -1, 'generation');

    const view = await getCreditsView(ctx.db, m);
    expect(view.balance).toBe(1198);
    expect(view.included).toBe(1200); // growth allotment
    expect(view.used).toBe(2);
    expect(view.ledger).toHaveLength(3);
    expect(view.resetsAt).toBeTruthy();
  });

  it('scopes strictly to the merchant — no cross-tenant leakage', async () => {
    const a = await newMerchant('starter');
    const b = await newMerchant('starter');
    await entry(a, 250, 'grant');
    await entry(b, 999, 'grant');
    await entry(b, -5, 'generation');

    const va = await getCreditsView(ctx.db, a);
    expect(va.balance).toBe(250);
    expect(va.ledger).toHaveLength(1);

    const vb = await getCreditsView(ctx.db, b);
    expect(vb.balance).toBe(994);
    expect(vb.ledger).toHaveLength(2);
  });
});

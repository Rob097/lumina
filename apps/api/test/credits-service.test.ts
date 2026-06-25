import { randomUUID } from 'node:crypto';
import { accounts, creditLedger, merchants } from '@lumina/db';
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

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.sqlClient`insert into auth.users (id, email) values (${id}::uuid, ${`u-${id}@x.com`})`;
  return id;
}

async function newAccount(plan: PlanTier, balance: number): Promise<string> {
  const rows = await ctx.db
    .insert(accounts)
    .values({ ownerUserId: await newUser(), plan, creditsBalance: balance })
    .returning();
  return firstOrThrow(rows).id;
}

async function newMerchant(accountId: string, plan: PlanTier): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Co', slug: `co-${randomUUID()}`, plan, accountId })
    .returning();
  return firstOrThrow(rows).id;
}

async function entry(
  accountId: string,
  merchantId: string,
  amount: number,
  reason: LedgerReason,
): Promise<void> {
  await ctx.db.insert(creditLedger).values({ accountId, merchantId, amount, reason });
}

describe('getCreditsView (shared account pool)', () => {
  it('returns the account balance, the plan allotment, and the account ledger', async () => {
    const acc = await newAccount('growth', 998);
    const m = await newMerchant(acc, 'growth');
    await entry(acc, m, 1000, 'grant');
    await entry(acc, m, -1, 'generation');
    await entry(acc, m, -1, 'generation');

    const view = await getCreditsView(ctx.db, m);
    expect(view.balance).toBe(998); // accounts.credits_balance (the pooled cache)
    expect(view.included).toBe(1000); // growth allotment
    expect(view.used).toBe(2);
    expect(view.ledger).toHaveLength(3);
    expect(view.resetsAt).toBeTruthy();
  });

  it("pools credits across an account's workspaces — every shop sees the same balance + ledger", async () => {
    const acc = await newAccount('pro', 3000);
    const shopA = await newMerchant(acc, 'pro');
    const shopB = await newMerchant(acc, 'pro');
    await entry(acc, shopA, 3000, 'grant');
    await entry(acc, shopA, -1, 'generation');
    await entry(acc, shopB, -1, 'generation');

    const va = await getCreditsView(ctx.db, shopA);
    const vb = await getCreditsView(ctx.db, shopB);
    expect(va.balance).toBe(3000);
    expect(vb.balance).toBe(3000); // same pool, whichever shop you view it from
    expect(va.ledger).toHaveLength(3); // includes both shops' activity
    expect(vb.ledger).toHaveLength(3);
  });

  it('does not leak across accounts', async () => {
    const accA = await newAccount('starter', 250);
    const accB = await newAccount('starter', 994);
    const a = await newMerchant(accA, 'starter');
    const b = await newMerchant(accB, 'starter');
    await entry(accA, a, 250, 'grant');
    await entry(accB, b, 999, 'grant');
    await entry(accB, b, -5, 'generation');

    const va = await getCreditsView(ctx.db, a);
    expect(va.balance).toBe(250);
    expect(va.ledger).toHaveLength(1);

    const vb = await getCreditsView(ctx.db, b);
    expect(vb.balance).toBe(994);
    expect(vb.ledger).toHaveLength(2);
  });
});

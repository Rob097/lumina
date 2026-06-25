import { randomUUID } from 'node:crypto';
import { accounts, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import type { PlanTier } from '@lumina/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveAccountPlan } from '../src/lib/account/plan.js';

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

async function newAccount(plan: PlanTier): Promise<string> {
  const rows = await ctx.db
    .insert(accounts)
    .values({ ownerUserId: await newUser(), plan })
    .returning();
  return firstOrThrow(rows).id;
}

async function newMerchant(opts: { accountId?: string; plan: PlanTier }): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({
      name: 'Co',
      slug: `co-${randomUUID()}`,
      plan: opts.plan,
      ...(opts.accountId ? { accountId: opts.accountId } : {}),
    })
    .returning();
  return firstOrThrow(rows).id;
}

describe('resolveAccountPlan', () => {
  it('returns the owning account plan, not the merchant column', async () => {
    const accountId = await newAccount('pro');
    // The merchant column is vestigial; a stale value must not override the account.
    const merchantId = await newMerchant({ accountId, plan: 'free' });
    expect(await resolveAccountPlan(ctx.db, merchantId)).toBe('pro');
  });

  it('falls back to the merchant plan when not linked to an account', async () => {
    const merchantId = await newMerchant({ plan: 'growth' });
    expect(await resolveAccountPlan(ctx.db, merchantId)).toBe('growth');
  });

  it('returns free for an unknown merchant', async () => {
    expect(await resolveAccountPlan(ctx.db, randomUUID())).toBe('free');
  });
});

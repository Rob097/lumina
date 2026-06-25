import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { accounts, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  changeSubscriptionPlan,
  planChangeSuspendSet,
} from '../src/lib/billing/change.js';

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

/** A `pro` account with `n` active workspaces + a fixed credit balance to prove it's never touched. */
async function newAccountWithShops(n: number): Promise<{ accountId: string; shops: string[] }> {
  const accountId = firstOrThrow(
    await ctx.db
      .insert(accounts)
      .values({ ownerUserId: await newUser(), plan: 'pro', creditsBalance: 2500 })
      .returning(),
  ).id;
  const shops: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const m = firstOrThrow(
      await ctx.db
        .insert(merchants)
        .values({ name: `Shop ${i}`, slug: `shop-${randomUUID()}`, plan: 'pro', accountId })
        .returning(),
    );
    shops.push(m.id);
  }
  return { accountId, shops };
}

function stubStripe(update = vi.fn(async () => ({}))): { stripe: Stripe; update: typeof update } {
  const stripe = {
    subscriptions: {
      retrieve: vi.fn(async () => ({ items: { data: [{ id: 'si_1' }] } })),
      update,
    },
  } as unknown as Stripe;
  return { stripe, update };
}

const ENV = { STRIPE_PRICE_STARTER: 'price_starter' };

describe('planChangeSuspendSet (pure validation)', () => {
  const active = ['a', 'b', 'c'];

  it('no reduction → empty suspend set, rejects a stray selection', () => {
    expect(planChangeSuspendSet(active, [], 3)).toEqual({ ok: true, suspendMerchantIds: [] });
    expect(planChangeSuspendSet(active, ['a'], 3).ok).toBe(false);
  });

  it('reduction requires EXACTLY targetLimit kept; rejects wrong count', () => {
    expect(planChangeSuspendSet(active, ['a', 'b'], 1).ok).toBe(false); // too many
    expect(planChangeSuspendSet(active, [], 1).ok).toBe(false); // too few
    const ok = planChangeSuspendSet(active, ['a'], 1);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.suspendMerchantIds.sort()).toEqual(['b', 'c']);
  });

  it('rejects a foreign id (not an active shop) with zero side effects', () => {
    expect(planChangeSuspendSet(active, ['zzz'], 1).ok).toBe(false);
  });

  it('rejects duplicates', () => {
    expect(planChangeSuspendSet(active, ['a', 'a'], 1).ok).toBe(false);
  });
});

describe('changeSubscriptionPlan', () => {
  it('updates the Stripe price (proration none) and deactivates the non-kept shops', async () => {
    const { accountId, shops } = await newAccountWithShops(3);
    const [keep, dropA, dropB] = shops;
    const { stripe, update } = stubStripe();

    const res = await changeSubscriptionPlan(stripe, ctx.db, ENV, {
      accountId,
      subscriptionId: 'sub_1',
      targetPlan: 'starter',
      suspendMerchantIds: [dropA!, dropB!],
    });

    expect(update).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        items: [{ id: 'si_1', price: 'price_starter' }],
        proration_behavior: 'none',
      }),
      {},
    );
    expect(res.suspended.sort()).toEqual([dropA, dropB].sort());

    const rows = await ctx.db.select().from(merchants).where(eq(merchants.accountId, accountId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(keep!)?.suspendedAt).toBeNull();
    expect(byId.get(dropA!)?.suspendedAt).not.toBeNull();
    expect(byId.get(dropB!)?.suspendedAt).not.toBeNull();

    // The account + its shared credits are NEVER touched.
    const acc = firstOrThrow(await ctx.db.select().from(accounts).where(eq(accounts.id, accountId)));
    expect(acc.creditsBalance).toBe(2500);
    expect(acc.plan).toBe('pro'); // webhook updates this, not us
  });

  it('runs Stripe BEFORE any deactivation — a Stripe failure deactivates nothing', async () => {
    const { accountId, shops } = await newAccountWithShops(3);
    const { stripe } = stubStripe(
      vi.fn(async () => {
        throw new Error('card_declined');
      }),
    );

    await expect(
      changeSubscriptionPlan(stripe, ctx.db, ENV, {
        accountId,
        subscriptionId: 'sub_1',
        targetPlan: 'starter',
        suspendMerchantIds: [shops[1]!, shops[2]!],
      }),
    ).rejects.toThrow(/card_declined/);

    const rows = await ctx.db.select().from(merchants).where(eq(merchants.accountId, accountId));
    expect(rows.every((r) => r.suspendedAt === null)).toBe(true); // nothing deactivated
  });

  it('refuses to deactivate every workspace (never leaves the account at zero active)', async () => {
    const { accountId, shops } = await newAccountWithShops(2);
    const { stripe } = stubStripe();
    await expect(
      changeSubscriptionPlan(stripe, ctx.db, ENV, {
        accountId,
        subscriptionId: 'sub_1',
        targetPlan: 'starter',
        suspendMerchantIds: shops, // all of them
      }),
    ).rejects.toThrow(/every workspace/);
  });

  it('downgrade to a price-less tier (free) schedules cancellation at period end', async () => {
    const { accountId } = await newAccountWithShops(1);
    const { stripe, update } = stubStripe();
    await changeSubscriptionPlan(stripe, ctx.db, {}, {
      accountId,
      subscriptionId: 'sub_1',
      targetPlan: 'free',
      suspendMerchantIds: [],
    });
    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true }, {});
  });
});

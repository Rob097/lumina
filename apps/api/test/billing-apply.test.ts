import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { creditLedger, merchants, subscriptions } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyBillingEvent } from '../src/lib/billing/apply.js';
import type { BillingEvent } from '../src/lib/billing/types.js';

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
    .values({ name: 'BillCo', slug: `billco-${randomUUID()}`, plan: 'free', creditsBalance: 0 })
    .returning();
  return firstOrThrow(rows).id;
}

function activeEvent(merchantId: string): BillingEvent {
  return {
    id: `evt_${randomUUID()}`,
    type: 'subscription_active',
    merchantId,
    plan: 'growth',
    includedCredits: 1200,
    grantCredits: true,
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
  };
}

describe('applyBillingEvent', () => {
  it('grants credits once, sets the plan, and upserts the subscription', async () => {
    const merchantId = await newMerchant();
    const evt = activeEvent(merchantId);

    const result = await applyBillingEvent(ctx.db, evt);
    expect(result.applied).toBe(true);

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)),
    );
    expect(merchant.plan).toBe('growth');
    expect(merchant.creditsBalance).toBe(1200);

    const sub = firstOrThrow(
      await ctx.db.select().from(subscriptions).where(eq(subscriptions.merchantId, merchantId)),
    );
    expect(sub.status).toBe('active');
    expect(sub.includedCredits).toBe(1200);

    const ledger = await ctx.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.merchantId, merchantId));
    expect(ledger).toHaveLength(1);
    expect(firstOrThrow(ledger).stripeRef).toBe(evt.id);
  });

  it('is idempotent: replaying the same event id does NOT double-grant', async () => {
    const merchantId = await newMerchant();
    const evt = activeEvent(merchantId);

    await applyBillingEvent(ctx.db, evt);
    const replay = await applyBillingEvent(ctx.db, evt);
    expect(replay).toEqual({ applied: false, reason: 'duplicate' });

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)),
    );
    expect(merchant.creditsBalance).toBe(1200); // not 2400
  });

  it('applies a plan-only active event without granting', async () => {
    const merchantId = await newMerchant();
    await applyBillingEvent(ctx.db, { ...activeEvent(merchantId), grantCredits: false });

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)),
    );
    expect(merchant.plan).toBe('growth');
    expect(merchant.creditsBalance).toBe(0);
  });

  it('cancellation resets the plan to free and grants nothing', async () => {
    const merchantId = await newMerchant();
    await applyBillingEvent(ctx.db, activeEvent(merchantId));

    await applyBillingEvent(ctx.db, {
      id: `evt_${randomUUID()}`,
      type: 'subscription_canceled',
      merchantId,
      plan: 'free',
      includedCredits: 0,
      grantCredits: false,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      currentPeriodEnd: null,
    });

    const merchant = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)),
    );
    expect(merchant.plan).toBe('free');
    expect(merchant.creditsBalance).toBe(1200); // already-granted credits are retained

    const sub = firstOrThrow(
      await ctx.db.select().from(subscriptions).where(eq(subscriptions.merchantId, merchantId)),
    );
    expect(sub.status).toBe('canceled');
  });
});

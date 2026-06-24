import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { buildPriceMap, planForPrice, toBillingEvent } from '../src/lib/billing/stripe.js';

const priceMap = buildPriceMap({ STRIPE_PRICE_GROWTH: 'price_growth', STRIPE_PRICE_SCALE: 'price_scale' });

describe('price map', () => {
  it('builds from env and resolves prices to plans', () => {
    expect(planForPrice(priceMap, 'price_growth')).toBe('growth');
    expect(planForPrice(priceMap, 'price_scale')).toBe('scale');
    expect(planForPrice(priceMap, 'price_unknown')).toBeNull();
  });
});

function subEvent(type: string, overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_1',
    type,
    data: {
      object: {
        id: 'sub_1',
        status: 'active',
        customer: 'cus_1',
        metadata: { merchant_id: 'm1' },
        items: { data: [{ price: { id: 'price_growth' } }] },
        current_period_end: 1893456000,
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe('toBillingEvent', () => {
  it('maps a created subscription to an active grant', () => {
    const evt = toBillingEvent(subEvent('customer.subscription.created'), priceMap);
    expect(evt?.type).toBe('subscription_active');
    expect(evt?.plan).toBe('growth');
    expect(evt?.includedCredits).toBe(1000);
    expect(evt?.grantCredits).toBe(true);
    expect(evt?.merchantId).toBe('m1');
    expect(evt?.stripeCustomerId).toBe('cus_1');
  });

  it('treats updates as plan-only (no grant)', () => {
    const evt = toBillingEvent(subEvent('customer.subscription.updated'), priceMap);
    expect(evt?.type).toBe('subscription_active');
    expect(evt?.grantCredits).toBe(false);
  });

  it('cancels (plan → free) on deletion', () => {
    const evt = toBillingEvent(subEvent('customer.subscription.deleted'), priceMap);
    expect(evt?.type).toBe('subscription_canceled');
    expect(evt?.plan).toBe('free');
    expect(evt?.grantCredits).toBe(false);
  });

  it('returns null without merchant_id metadata', () => {
    const evt = toBillingEvent(subEvent('customer.subscription.created', { metadata: {} }), priceMap);
    expect(evt).toBeNull();
  });

  it('ignores unrelated event types', () => {
    const other = { id: 'e', type: 'payment_intent.succeeded', data: { object: {} } } as unknown as Stripe.Event;
    expect(toBillingEvent(other, priceMap)).toBeNull();
  });
});

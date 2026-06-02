import Stripe from 'stripe';
import { PLAN_CATALOG, type PlanTier } from '@lumina/shared';
import type { BillingEvent } from './types.js';

/** Construct a Stripe client. Server-only — never expose the secret key. */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

export type PriceMap = Record<string, PlanTier>;

/** Build the Stripe price-id → plan-tier map from env (`STRIPE_PRICE_<TIER>`). */
export function buildPriceMap(env: Record<string, string | undefined>): PriceMap {
  const map: PriceMap = {};
  const pairs: ReadonlyArray<[PlanTier, string]> = [
    ['starter', 'STRIPE_PRICE_STARTER'],
    ['growth', 'STRIPE_PRICE_GROWTH'],
    ['scale', 'STRIPE_PRICE_SCALE'],
    ['enterprise', 'STRIPE_PRICE_ENTERPRISE'],
  ];
  for (const [plan, key] of pairs) {
    const id = env[key];
    if (id) {
      map[id] = plan;
    }
  }
  return map;
}

export function planForPrice(map: PriceMap, priceId: string): PlanTier | null {
  return map[priceId] ?? null;
}

/** Minimal shape we read off a Stripe Subscription — decoupled from Stripe's version-specific types. */
interface MinimalSubscription {
  id: string;
  status: string;
  customer: string | { id: string };
  metadata?: Record<string, string> | null;
  items: { data: Array<{ price: { id: string } }> };
  current_period_end?: number | null;
}

function customerId(customer: string | { id: string }): string {
  return typeof customer === 'string' ? customer : customer.id;
}

/**
 * Map a verified Stripe event to our normalized `BillingEvent`, or null if it's not one we act on.
 * `merchant_id` must be present in the subscription metadata (set at checkout creation).
 * Grants credits on subscription creation; updates are plan-only; deletion cancels (plan → free).
 */
export function toBillingEvent(event: Stripe.Event, priceMap: PriceMap): BillingEvent | null {
  if (
    event.type !== 'customer.subscription.created' &&
    event.type !== 'customer.subscription.updated' &&
    event.type !== 'customer.subscription.deleted'
  ) {
    return null;
  }

  const sub = event.data.object as unknown as MinimalSubscription;
  const merchantId = sub.metadata?.merchant_id;
  if (!merchantId) {
    return null;
  }

  const priceId = sub.items.data[0]?.price.id;
  const mappedPlan = priceId ? planForPrice(priceMap, priceId) : null;
  const canceled = event.type === 'customer.subscription.deleted' || sub.status === 'canceled';
  const plan: PlanTier = canceled ? 'free' : (mappedPlan ?? 'free');

  return {
    id: event.id,
    type: canceled ? 'subscription_canceled' : 'subscription_active',
    merchantId,
    plan,
    includedCredits: PLAN_CATALOG[plan].includedCredits,
    grantCredits: event.type === 'customer.subscription.created' && !canceled,
    stripeCustomerId: customerId(sub.customer),
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
  };
}

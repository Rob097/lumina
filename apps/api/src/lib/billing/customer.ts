import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { subscriptions, type Database } from '@lumina/db';

/**
 * Whether a stored Stripe customer must be replaced before a checkout can succeed. Stripe pins
 * `customer.currency` to the FIRST currency it transacts in and it is then **immutable** — so a customer
 * created under the old USD prices can never check out an EUR price ("You cannot combine currencies on a
 * single customer"). We also replace a missing (resource_missing) or deleted customer. Pure + unit-tested.
 */
export function mustReplaceCustomer(
  // `deleted` is `unknown` so a Stripe `Customer` (whose `deleted` is typed `void`) and a `DeletedCustomer`
  // (`deleted: true`) both pass structurally; a plain truthy check covers both.
  cust: { deleted?: unknown; currency?: string | null } | null,
  wantCurrency: string,
): boolean {
  if (!cust) return true; // missing (e.g. deleted out-of-band → resource_missing on retrieve)
  if (cust.deleted) return true; // deleted customer
  // currency is null until the customer's first transaction → a fresh customer is fine for any currency.
  if (cust.currency && cust.currency !== wantCurrency) return true;
  return false;
}

/**
 * Ensure the merchant has a Stripe customer usable for `wantCurrency` (default EUR), creating + persisting
 * one on first use — or replacing a stored customer that is missing/deleted or currency-locked to a
 * different currency (see {@link mustReplaceCustomer}). A transient retrieve failure is rethrown (so we
 * never orphan a valid customer on a blip); only a confirmed `resource_missing` is treated as replaceable.
 */
export async function ensureStripeCustomer(
  db: Database,
  stripe: Stripe,
  merchantId: string,
  wantCurrency = 'eur',
): Promise<string> {
  const rows = await db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.merchantId, merchantId))
    .limit(1);
  const existing = rows[0]?.customerId;
  if (existing) {
    const cust = await stripe.customers.retrieve(existing).catch((err: unknown) => {
      if ((err as Stripe.errors.StripeError)?.code === 'resource_missing') return null;
      throw err; // transient/unknown → surface; don't spuriously replace a valid customer
    });
    if (!mustReplaceCustomer(cust, wantCurrency)) {
      return existing;
    }
    // else: missing / deleted / currency-locked → fall through and mint a fresh customer.
  }

  const customer = await stripe.customers.create({ metadata: { merchant_id: merchantId } });
  await db
    .insert(subscriptions)
    .values({ merchantId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: subscriptions.merchantId,
      // Repoint to the fresh customer and drop the stale subscription id (it belonged to the old customer);
      // the next subscription.created webhook repopulates it.
      set: { stripeCustomerId: customer.id, stripeSubscriptionId: null, updatedAt: new Date() },
    });
  return customer.id;
}

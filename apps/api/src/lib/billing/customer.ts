import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { subscriptions, type Database } from '@lumina/db';

/** Ensure the merchant has a Stripe customer; create + persist one on first use. */
export async function ensureStripeCustomer(
  db: Database,
  stripe: Stripe,
  merchantId: string,
): Promise<string> {
  const rows = await db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.merchantId, merchantId))
    .limit(1);
  const existing = rows[0]?.customerId;
  if (existing) {
    return existing;
  }

  const customer = await stripe.customers.create({ metadata: { merchant_id: merchantId } });
  await db
    .insert(subscriptions)
    .values({ merchantId, stripeCustomerId: customer.id })
    .onConflictDoUpdate({
      target: subscriptions.merchantId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });
  return customer.id;
}

import { and, eq, isNotNull } from 'drizzle-orm';
import { merchants, subscriptions } from '@lumina/db';
import { PlanTierSchema } from '@lumina/shared';
import { z } from 'zod';
import { ensureStripeCustomer } from '@/lib/billing/customer';
import { createStripeClient, priceForPlan } from '@/lib/billing/stripe';
import { isAccountOwner } from '@/lib/account/account-owner';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const CheckoutSchema = z.object({ plan: PlanTierSchema });

export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  // Billing is account-owner-only (the support super-admin and plain members are blocked at the API, not
  // just hidden in the UI). Mirrors billing/change + workspaces/delete.
  if (!(await isAccountOwner(guard.db, guard.merchantId, guard.user.id))) {
    return errorResponse('unauthorized', 'Only the account owner can manage billing.');
  }
  const parsed = CheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid plan');
  }

  // One subscription per account: the plan + credits are shared, so a real subscription on ANY of the
  // account's workspaces means there's nothing to buy here — changes go through the billing portal
  // (Stripe handles upgrades/downgrades + proration). Prevents a duplicate, double-charged subscription
  // on a second shop. A customer-only row (no stripeSubscriptionId yet) doesn't count.
  const [mrow] = await guard.db
    .select({ accountId: merchants.accountId })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  if (mrow?.accountId) {
    const [existing] = await guard.db
      .select({ mid: subscriptions.merchantId })
      .from(subscriptions)
      .innerJoin(merchants, eq(subscriptions.merchantId, merchants.id))
      .where(and(eq(merchants.accountId, mrow.accountId), isNotNull(subscriptions.stripeSubscriptionId)))
      .limit(1);
    if (existing) {
      return errorResponse(
        'invalid_input',
        'This account already has an active subscription. Use “Manage billing” to change or cancel it.',
      );
    }
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return serverError('Billing is not configured');
  }
  const priceId = priceForPlan(process.env, parsed.data.plan);
  if (!priceId) {
    return errorResponse('invalid_input', `No price configured for plan "${parsed.data.plan}"`);
  }

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const stripe = createStripeClient(secret);
  // Every plan ships with a free trial, no card required (public pricing page). `if_required` skips card
  // collection up front; if no payment method is added by the trial's end the subscription is canceled
  // rather than left unpaid. Trial length is env-tunable (default 14 days; Relievum's campaign uses 30).
  const trialDays = Number(process.env.TRIAL_PERIOD_DAYS ?? 14);
  try {
    // Our prices are EUR; ensure the customer isn't currency-locked to another currency (Stripe forbids
    // mixing currencies on one customer) — a stale USD customer is transparently replaced.
    const customer = await ensureStripeCustomer(guard.db, stripe, guard.merchantId, 'eur');
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?status=success`,
      cancel_url: `${appUrl}/billing?status=cancelled`,
      payment_method_collection: 'if_required',
      subscription_data: {
        metadata: { merchant_id: guard.merchantId },
        ...(trialDays > 0
          ? {
              trial_period_days: trialDays,
              trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
            }
          : {}),
      },
    });
    if (!checkout.url) {
      return serverError('Failed to create checkout session');
    }
    return jsonResponse({ checkoutUrl: checkout.url });
  } catch (err) {
    // Surface the real Stripe reason (e.g. a currency conflict) instead of a misleading generic message.
    const message = err instanceof Error ? err.message : 'Checkout failed';
    return serverError(`Stripe error: ${message}`);
  }
}

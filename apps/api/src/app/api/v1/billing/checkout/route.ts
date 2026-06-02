import { PlanTierSchema } from '@lumina/shared';
import { z } from 'zod';
import { ensureStripeCustomer } from '@/lib/billing/customer';
import { createStripeClient, priceForPlan } from '@/lib/billing/stripe';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const CheckoutSchema = z.object({ plan: PlanTierSchema });

export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = CheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid plan');
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
  const customer = await ensureStripeCustomer(guard.db, stripe, guard.merchantId);
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?status=success`,
    cancel_url: `${appUrl}/billing?status=cancelled`,
    subscription_data: { metadata: { merchant_id: guard.merchantId } },
  });
  if (!checkout.url) {
    return serverError('Failed to create checkout session');
  }
  return jsonResponse({ checkoutUrl: checkout.url });
}

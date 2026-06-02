import type Stripe from 'stripe';
import { applyBillingEvent } from '@/lib/billing/apply';
import { buildPriceMap, createStripeClient, toBillingEvent } from '@/lib/billing/stripe';
import { getDb } from '@/lib/db';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return serverError('Billing is not configured');
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return errorResponse('invalid_input', 'Missing stripe-signature header');
  }

  const body = await request.text();
  const stripe = createStripeClient(secret);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch {
    return errorResponse('invalid_input', 'Invalid signature');
  }

  const billingEvent = toBillingEvent(event, buildPriceMap(process.env));
  if (!billingEvent) {
    return jsonResponse({ received: true, ignored: true });
  }
  await applyBillingEvent(getDb(), billingEvent);
  return jsonResponse({ received: true });
}

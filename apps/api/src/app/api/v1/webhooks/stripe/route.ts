import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { subscriptions, type Database } from '@lumina/db';
import { applyBillingEvent } from '@/lib/billing/apply';
import { buildPriceMap, createStripeClient, toBillingEvent } from '@/lib/billing/stripe';
import { getDb } from '@/lib/db';
import { emailSenderFromEnv } from '@/lib/email';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { notifyMerchant } from '@/lib/notifications/service';

export const runtime = 'nodejs';

/** Resolve the merchant behind a failed invoice and notify them (so they can fix billing). */
async function handlePaymentFailed(db: Database, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  if (!customerId) {
    return;
  }
  const rows = await db
    .select({ merchantId: subscriptions.merchantId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);
  const merchantId = rows[0]?.merchantId;
  if (!merchantId) {
    return;
  }
  await notifyMerchant(
    db,
    { email: emailSenderFromEnv(process.env) },
    {
      merchantId,
      type: 'payment_failed',
      title: 'A payment failed',
      body: 'Your latest YuzuView payment didn’t go through. Update your billing details to avoid interruption.',
      data: { invoiceId: invoice.id ?? null },
    },
  ).catch(() => {
    /* best-effort */
  });
}

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

  const db = getDb();
  if (event.type === 'invoice.payment_failed') {
    await handlePaymentFailed(db, event);
    return jsonResponse({ received: true });
  }

  const billingEvent = toBillingEvent(event, buildPriceMap(process.env));
  if (!billingEvent) {
    return jsonResponse({ received: true, ignored: true });
  }
  await applyBillingEvent(db, billingEvent);
  return jsonResponse({ received: true });
}

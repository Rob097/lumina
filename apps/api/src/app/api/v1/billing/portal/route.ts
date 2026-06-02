import { ensureStripeCustomer } from '@/lib/billing/customer';
import { createStripeClient } from '@/lib/billing/stripe';
import { requireMerchant } from '@/lib/guard';
import { jsonResponse, serverError } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return serverError('Billing is not configured');
  }
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const stripe = createStripeClient(secret);
  const customer = await ensureStripeCustomer(guard.db, stripe, guard.merchantId);
  const portal = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${appUrl}/billing`,
  });
  return jsonResponse({ portalUrl: portal.url });
}

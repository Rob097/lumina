import { accountStripeCustomerId, ensureStripeCustomer } from '@/lib/billing/customer';
import { createStripeClient } from '@/lib/billing/stripe';
import { isAccountOwner } from '@/lib/account/account-owner';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  // Billing is account-owner-only (the support super-admin and plain members are blocked at the API, not
  // just hidden in the UI). Mirrors billing/change + workspaces/delete.
  if (!(await isAccountOwner(guard.db, guard.merchantId, guard.user.id))) {
    return errorResponse('unauthorized', 'Only the account owner can manage billing.');
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return serverError('Billing is not configured');
  }
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const stripe = createStripeClient(secret);
  // Use the ACCOUNT's existing customer (the subscription may live on a different / now-suspended shop);
  // only mint a new one if the account has never had a customer.
  const customer =
    (await accountStripeCustomerId(guard.db, guard.merchantId)) ??
    (await ensureStripeCustomer(guard.db, stripe, guard.merchantId));
  const portal = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${appUrl}/billing`,
  });
  return jsonResponse({ portalUrl: portal.url });
}

import type { PlanTier } from '@lumina/shared';

export type BillingEventType = 'subscription_active' | 'subscription_canceled';

/**
 * Normalized billing event — the provider-agnostic shape the credit/plan logic consumes. The Stripe
 * SDK specifics (signature verify, `Stripe.Event` → `BillingEvent`) live in `stripe.ts`, so the
 * money-touching `applyBillingEvent` stays simple and fully testable with synthetic events.
 */
export interface BillingEvent {
  /** Stripe event id — the idempotency key (webhooks_inbox). */
  id: string;
  type: BillingEventType;
  merchantId: string;
  plan: PlanTier;
  includedCredits: number;
  /** Whether this event should grant `includedCredits` (true for new subscriptions / renewals). */
  grantCredits: boolean;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
}

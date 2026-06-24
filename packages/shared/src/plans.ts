import { z } from 'zod';
import { PlanTierSchema, type PlanTier } from './enums.js';

export interface PlanInfo {
  /** Monthly credit allotment granted on subscription create/renewal. */
  includedCredits: number;
  /** Human label for the dashboard. */
  label: string;
}

/**
 * Plan catalog — the single source of truth mapping a `plan_tier` to its monthly included credits.
 * The Stripe webhook resolves price → plan → `includedCredits` from this table (no magic numbers).
 * Values are business-tunable; enterprise is custom/negotiated.
 */
export const PLAN_CATALOG: Record<PlanTier, PlanInfo> = {
  free: { includedCredits: 10, label: 'Free' },
  starter: { includedCredits: 300, label: 'Starter' },
  growth: { includedCredits: 1000, label: 'Growth' },
  pro: { includedCredits: 3000, label: 'Pro' },
  scale: { includedCredits: 6000, label: 'Scale (legacy)' },
  enterprise: { includedCredits: 10000, label: 'Enterprise' },
};

/**
 * The plans actually sold (shown as cards), in display order — matches the public pricing page
 * (Starter / Growth / Pro / Enterprise). `free` is the internal no-subscription default and `scale` is a
 * retired tier: both stay in {@link PLAN_CATALOG} (for the webhook + current-plan resolution) but are not
 * offered as purchasable cards.
 */
export const SELLABLE_PLAN_TIERS: readonly PlanTier[] = ['starter', 'growth', 'pro', 'enterprise'];

export interface PlanPresentation {
  /** Published monthly list price in EUR; `null` = custom / contact sales (enterprise). */
  priceMonthly: number | null;
  /** The visually-featured plan on the billing screen. */
  highlight: boolean;
  features: string[];
}

/**
 * Display metadata for the billing plan cards — kept separate from `PLAN_CATALOG` (the webhook
 * contract). Prices are published list prices (business-tunable); the actual charge is the Stripe
 * price resolved from env at checkout (`priceForPlan`), so nothing here is authoritative for billing.
 */
export const PLAN_PRESENTATION: Record<PlanTier, PlanPresentation> = {
  free: {
    priceMonthly: 0,
    highlight: false,
    features: ['10 visualizations / mo', 'Internal trial tier'],
  },
  starter: {
    priceMonthly: 149,
    highlight: false,
    features: ['300 visualizations / mo', '1 shop', 'Admin panel', 'Email support'],
  },
  growth: {
    priceMonthly: 349,
    highlight: true,
    features: [
      '1,000 visualizations / mo',
      '1 shop',
      'White-label (your brand)',
      'Analytics dashboard',
      'Priority support',
    ],
  },
  pro: {
    priceMonthly: 699,
    highlight: false,
    features: [
      '3,000 visualizations / mo',
      'Up to 3 shops',
      'API access',
      'White-label (your brand)',
      'Priority support',
    ],
  },
  scale: {
    priceMonthly: 799,
    highlight: false,
    features: ['6,000 visualizations / mo (legacy plan)'],
  },
  enterprise: {
    priceMonthly: null,
    highlight: false,
    features: [
      '10,000 visualizations / mo',
      'Unlimited shops',
      'All features included',
      'Dedicated account manager',
      'Custom onboarding + SLA',
    ],
  },
};

export const BillingPlanSchema = z.object({
  tier: PlanTierSchema,
  label: z.string(),
  priceMonthly: z.number().nonnegative().nullable(),
  includedCredits: z.number().int().nonnegative(),
  highlight: z.boolean(),
  features: z.array(z.string()),
});
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

/** `GET /v1/billing/plans` — the plan cards + the merchant's current tier (§6.3). */
export const BillingPlansResponseSchema = z.object({
  plans: z.array(BillingPlanSchema),
  currentPlan: PlanTierSchema,
});
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseSchema>;

/**
 * Compose the billing-plans response from catalog + presentation for a merchant's current tier. Only the
 * sellable tiers ({@link SELLABLE_PLAN_TIERS}) are returned as cards; `free`/`scale` are never offered.
 */
export function buildBillingPlans(currentPlan: PlanTier): BillingPlansResponse {
  const plans: BillingPlan[] = SELLABLE_PLAN_TIERS.map((tier) => ({
    tier,
    label: PLAN_CATALOG[tier].label,
    includedCredits: PLAN_CATALOG[tier].includedCredits,
    priceMonthly: PLAN_PRESENTATION[tier].priceMonthly,
    highlight: PLAN_PRESENTATION[tier].highlight,
    features: PLAN_PRESENTATION[tier].features,
  }));
  return { plans, currentPlan };
}

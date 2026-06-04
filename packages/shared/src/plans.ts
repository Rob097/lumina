import { z } from 'zod';
import { PLAN_TIERS, PlanTierSchema, type PlanTier } from './enums.js';

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
  starter: { includedCredits: 250, label: 'Starter' },
  growth: { includedCredits: 1200, label: 'Growth' },
  scale: { includedCredits: 6000, label: 'Scale' },
  enterprise: { includedCredits: 25000, label: 'Enterprise' },
};

export interface PlanPresentation {
  /** Published monthly list price in USD; `null` = custom / contact sales (enterprise). */
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
    features: ['10 credits / mo', '1 storefront', 'Community support'],
  },
  starter: {
    priceMonthly: 49,
    highlight: false,
    features: ['250 credits / mo', 'Custom widget theme', 'Email support'],
  },
  growth: {
    priceMonthly: 199,
    highlight: true,
    features: ['1,200 credits / mo', 'Remove LUMINA watermark', 'Priority support'],
  },
  scale: {
    priceMonthly: 799,
    highlight: false,
    features: ['6,000 credits / mo', 'Fast + quality model tiers', 'SLA + onboarding'],
  },
  enterprise: {
    priceMonthly: null,
    highlight: false,
    features: ['25,000+ credits / mo', 'Dedicated infra', 'Custom contract'],
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

/** Compose the billing-plans response from catalog + presentation for a merchant's current tier. */
export function buildBillingPlans(currentPlan: PlanTier): BillingPlansResponse {
  const plans: BillingPlan[] = PLAN_TIERS.map((tier) => ({
    tier,
    label: PLAN_CATALOG[tier].label,
    includedCredits: PLAN_CATALOG[tier].includedCredits,
    priceMonthly: PLAN_PRESENTATION[tier].priceMonthly,
    highlight: PLAN_PRESENTATION[tier].highlight,
    features: PLAN_PRESENTATION[tier].features,
  }));
  return { plans, currentPlan };
}

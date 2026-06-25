import { z } from 'zod';
import { PlanTierSchema, type PlanTier } from './enums.js';

export interface PlanInfo {
  /** Monthly credit allotment granted on subscription create/renewal. */
  includedCredits: number;
  /** Human label for the dashboard. */
  label: string;
  /** How many workspaces ("shops") an account on this plan may own. `Infinity` = unlimited. */
  maxShops: number;
}

/**
 * Plan catalog — the single source of truth mapping a `plan_tier` to its monthly included credits and
 * shop allowance. The Stripe webhook resolves price → plan → `includedCredits` from this table (no magic
 * numbers); workspace creation enforces `maxShops`. Values are business-tunable; enterprise is custom.
 */
export const PLAN_CATALOG: Record<PlanTier, PlanInfo> = {
  free: { includedCredits: 10, label: 'Free', maxShops: 1 },
  starter: { includedCredits: 300, label: 'Starter', maxShops: 1 },
  growth: { includedCredits: 1000, label: 'Growth', maxShops: 1 },
  pro: { includedCredits: 3000, label: 'Pro', maxShops: 3 },
  scale: { includedCredits: 6000, label: 'Scale (legacy)', maxShops: 3 },
  enterprise: { includedCredits: 10000, label: 'Enterprise', maxShops: Infinity },
};

/** Shops an account on `plan` may own (`Infinity` = unlimited). The single source for the shop cap. */
export function shopLimit(plan: PlanTier): number {
  return PLAN_CATALOG[plan].maxShops;
}

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

/** `GET /v1/billing/plans` — the plan cards + the account's current tier (§6.3). */
export const BillingPlansResponseSchema = z.object({
  plans: z.array(BillingPlanSchema),
  currentPlan: PlanTierSchema,
  /** Whether the account already has a live Stripe subscription — drives portal-vs-checkout routing. */
  hasActiveSubscription: z.boolean().default(false),
});
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseSchema>;

/**
 * Compose the billing-plans response from catalog + presentation for an account's current tier. Only the
 * sellable tiers ({@link SELLABLE_PLAN_TIERS}) are returned as cards; `free`/`scale` are never offered.
 */
export function buildBillingPlans(
  currentPlan: PlanTier,
  opts: { hasActiveSubscription?: boolean } = {},
): BillingPlansResponse {
  const plans: BillingPlan[] = SELLABLE_PLAN_TIERS.map((tier) => ({
    tier,
    label: PLAN_CATALOG[tier].label,
    includedCredits: PLAN_CATALOG[tier].includedCredits,
    priceMonthly: PLAN_PRESENTATION[tier].priceMonthly,
    highlight: PLAN_PRESENTATION[tier].highlight,
    features: PLAN_PRESENTATION[tier].features,
  }));
  return { plans, currentPlan, hasActiveSubscription: opts.hasActiveSubscription ?? false };
}

/**
 * The features present on `currentPlan` but not on `targetPlan` — what the merchant gives up by
 * downgrading. A plain set-difference of the presentation feature lists (higher-volume lines naturally
 * surface as "lost or reduced"); used to populate the downgrade-confirmation modal.
 */
export function lostFeatures(currentPlan: PlanTier, targetPlan: PlanTier): string[] {
  const kept = new Set(PLAN_PRESENTATION[targetPlan].features);
  return PLAN_PRESENTATION[currentPlan].features.filter((f) => !kept.has(f));
}

/** `POST /v1/billing/change` — change the account's plan (downgrade), keeping `keepMerchantIds` active. */
export const PlanChangeRequestSchema = z.object({
  targetPlan: PlanTierSchema,
  /** Which workspaces stay active (exactly `shopLimit(targetPlan)` when the downgrade reduces the cap). */
  keepMerchantIds: z.array(z.string().uuid()).optional(),
});
export type PlanChangeRequest = z.infer<typeof PlanChangeRequestSchema>;

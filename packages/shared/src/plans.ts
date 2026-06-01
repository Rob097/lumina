import type { PlanTier } from './enums.js';

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

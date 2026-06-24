import type { PlanTier } from '@lumina/shared';

/**
 * Price-order rank of a plan tier (cheapest → most expensive) for the upgrade/downgrade CTA. Explicit, NOT
 * the `PLAN_TIERS` storage order — `pro` is appended last in the enum (a non-destructive Postgres migration)
 * but sits between growth and enterprise by price.
 */
const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  pro: 3,
  scale: 4,
  enterprise: 5,
};

/** Order index of a plan tier (cheapest → most expensive). */
export function planRank(tier: PlanTier): number {
  return PLAN_RANK[tier];
}

export type PlanCta = 'current' | 'upgrade' | 'downgrade' | 'contact';

/** What the plan card's action should offer relative to the merchant's current tier. */
export function planCta(current: PlanTier, target: PlanTier): PlanCta {
  if (current === target) return 'current';
  if (target === 'enterprise') return 'contact';
  return planRank(target) > planRank(current) ? 'upgrade' : 'downgrade';
}

/** Display the published monthly price: `null` → Custom, `0` → Free, else `€349`. */
export function formatPrice(priceMonthly: number | null): string {
  if (priceMonthly === null) return 'Custom';
  if (priceMonthly === 0) return 'Free';
  return `€${priceMonthly}`;
}

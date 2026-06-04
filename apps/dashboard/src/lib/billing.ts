import { PLAN_TIERS, type PlanTier } from '@lumina/shared';

/** Order index of a plan tier (cheapest → most expensive). */
export function planRank(tier: PlanTier): number {
  return PLAN_TIERS.indexOf(tier);
}

export type PlanCta = 'current' | 'upgrade' | 'downgrade' | 'contact';

/** What the plan card's action should offer relative to the merchant's current tier. */
export function planCta(current: PlanTier, target: PlanTier): PlanCta {
  if (current === target) return 'current';
  if (target === 'enterprise') return 'contact';
  return planRank(target) > planRank(current) ? 'upgrade' : 'downgrade';
}

/** Display the published monthly price: `null` → Custom, `0` → Free, else `$199`. */
export function formatPrice(priceMonthly: number | null): string {
  if (priceMonthly === null) return 'Custom';
  if (priceMonthly === 0) return 'Free';
  return `$${priceMonthly}`;
}

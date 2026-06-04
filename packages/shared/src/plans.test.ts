import { describe, expect, it } from 'vitest';
import {
  BillingPlanSchema,
  BillingPlansResponseSchema,
  PLAN_CATALOG,
  PLAN_PRESENTATION,
  buildBillingPlans,
} from './plans.js';
import { PLAN_TIERS } from './enums.js';

describe('PLAN_CATALOG', () => {
  it('has an entry for every plan tier', () => {
    for (const tier of PLAN_TIERS) {
      expect(PLAN_CATALOG[tier]).toBeDefined();
      expect(typeof PLAN_CATALOG[tier].includedCredits).toBe('number');
      expect(PLAN_CATALOG[tier].label.length).toBeGreaterThan(0);
    }
  });

  it('free tier grants the fewest credits; paid tiers grant more', () => {
    expect(PLAN_CATALOG.free.includedCredits).toBeLessThanOrEqual(PLAN_CATALOG.starter.includedCredits);
    expect(PLAN_CATALOG.starter.includedCredits).toBeLessThan(PLAN_CATALOG.growth.includedCredits);
    expect(PLAN_CATALOG.growth.includedCredits).toBeLessThan(PLAN_CATALOG.scale.includedCredits);
  });
});

describe('PLAN_PRESENTATION', () => {
  it('has display metadata (price/features) for every tier', () => {
    for (const tier of PLAN_TIERS) {
      const p = PLAN_PRESENTATION[tier];
      expect(p).toBeDefined();
      expect(Array.isArray(p.features)).toBe(true);
      expect(p.features.length).toBeGreaterThan(0);
    }
  });

  it('prices the free tier at 0 and leaves enterprise custom (null)', () => {
    expect(PLAN_PRESENTATION.free.priceMonthly).toBe(0);
    expect(PLAN_PRESENTATION.enterprise.priceMonthly).toBeNull();
  });
});

describe('BillingPlansResponseSchema', () => {
  it('validates a plans response shaped from catalog + presentation', () => {
    const plan = BillingPlanSchema.parse({
      tier: 'growth',
      label: 'Growth',
      priceMonthly: 199,
      includedCredits: 1200,
      highlight: true,
      features: ['1,200 credits / mo'],
    });
    expect(plan.tier).toBe('growth');
    const res = BillingPlansResponseSchema.parse({ plans: [plan], currentPlan: 'starter' });
    expect(res.currentPlan).toBe('starter');
  });

  it('buildBillingPlans composes a card per tier with the current plan', () => {
    const res = buildBillingPlans('growth');
    expect(BillingPlansResponseSchema.parse(res)).toBeTruthy();
    expect(res.currentPlan).toBe('growth');
    expect(res.plans).toHaveLength(5);
    expect(res.plans.find((p) => p.tier === 'growth')?.includedCredits).toBe(1200);
  });
});

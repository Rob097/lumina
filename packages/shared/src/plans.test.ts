import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_MIN_PLAN,
  BillingPlanSchema,
  BillingPlansResponseSchema,
  PLAN_CATALOG,
  PLAN_PRESENTATION,
  PlanChangeRequestSchema,
  buildBillingPlans,
  canUseAnalytics,
  lostFeatures,
  shopLimit,
} from './plans.js';
import { PLAN_TIERS } from './enums.js';

describe('canUseAnalytics', () => {
  it('is unavailable on free + starter, available from growth and up', () => {
    expect(canUseAnalytics('free')).toBe(false);
    expect(canUseAnalytics('starter')).toBe(false);
    expect(canUseAnalytics('growth')).toBe(true);
    expect(canUseAnalytics('pro')).toBe(true);
    expect(canUseAnalytics('scale')).toBe(true);
    expect(canUseAnalytics('enterprise')).toBe(true);
  });

  it('gates exactly at ANALYTICS_MIN_PLAN', () => {
    expect(ANALYTICS_MIN_PLAN).toBe('growth');
    expect(canUseAnalytics(ANALYTICS_MIN_PLAN)).toBe(true);
  });
});

describe('lostFeatures', () => {
  it('returns features on the current plan but not the target (a downgrade)', () => {
    const lost = lostFeatures('growth', 'starter');
    expect(lost).toContain('White-label (your brand)');
    expect(lost).toContain('Priority support');
    expect(lost).not.toContain('1 shop'); // shared by both → not lost
  });

  it('returns [] for the same plan', () => {
    expect(lostFeatures('growth', 'growth')).toEqual([]);
  });
});

describe('buildBillingPlans hasActiveSubscription', () => {
  it('defaults to false and is set from opts', () => {
    expect(buildBillingPlans('growth').hasActiveSubscription).toBe(false);
    expect(buildBillingPlans('growth', { hasActiveSubscription: true }).hasActiveSubscription).toBe(
      true,
    );
  });
});

describe('PlanChangeRequestSchema', () => {
  it('accepts a target plan with optional uuid keep list, rejects non-uuids', () => {
    expect(PlanChangeRequestSchema.safeParse({ targetPlan: 'starter' }).success).toBe(true);
    expect(
      PlanChangeRequestSchema.safeParse({
        targetPlan: 'starter',
        keepMerchantIds: ['11111111-1111-4111-8111-111111111111'],
      }).success,
    ).toBe(true);
    expect(
      PlanChangeRequestSchema.safeParse({ targetPlan: 'starter', keepMerchantIds: ['nope'] }).success,
    ).toBe(false);
  });
});

describe('shopLimit', () => {
  it('caps single-shop plans at 1 and scales up for higher tiers', () => {
    expect(shopLimit('free')).toBe(1);
    expect(shopLimit('starter')).toBe(1);
    expect(shopLimit('growth')).toBe(1);
    expect(shopLimit('pro')).toBe(3);
    expect(shopLimit('enterprise')).toBe(Infinity);
  });

  it('matches PLAN_CATALOG.maxShops for every tier', () => {
    for (const tier of PLAN_TIERS) {
      expect(shopLimit(tier)).toBe(PLAN_CATALOG[tier].maxShops);
    }
  });
});

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
      priceMonthly: 349,
      includedCredits: 1000,
      highlight: true,
      features: ['1,000 visualizations / mo'],
    });
    expect(plan.tier).toBe('growth');
    const res = BillingPlansResponseSchema.parse({ plans: [plan], currentPlan: 'starter' });
    expect(res.currentPlan).toBe('starter');
  });

  it('buildBillingPlans returns only the sellable tiers (Starter/Growth/Pro/Enterprise), in order', () => {
    const res = buildBillingPlans('growth');
    expect(BillingPlansResponseSchema.parse(res)).toBeTruthy();
    expect(res.currentPlan).toBe('growth');
    expect(res.plans.map((p) => p.tier)).toEqual(['starter', 'growth', 'pro', 'enterprise']);
    // free + the legacy `scale` tier are never offered as cards
    expect(res.plans.some((p) => p.tier === 'free' || p.tier === 'scale')).toBe(false);
    expect(res.plans.find((p) => p.tier === 'growth')?.includedCredits).toBe(1000);
    expect(res.plans.find((p) => p.tier === 'pro')?.priceMonthly).toBe(699);
  });
});

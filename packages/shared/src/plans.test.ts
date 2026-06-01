import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG } from './plans.js';
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

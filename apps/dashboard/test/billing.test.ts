import { describe, expect, it } from 'vitest';
import { formatPrice, planCta, planRank } from '../src/lib/billing';

describe('planRank', () => {
  it('orders tiers cheapest → most expensive', () => {
    expect(planRank('free')).toBeLessThan(planRank('growth'));
    expect(planRank('growth')).toBeLessThan(planRank('enterprise'));
  });
});

describe('planCta', () => {
  it('marks the current plan', () => {
    expect(planCta('starter', 'starter')).toBe('current');
    expect(planCta('enterprise', 'enterprise')).toBe('current');
  });

  it('distinguishes upgrade vs downgrade', () => {
    expect(planCta('starter', 'growth')).toBe('upgrade');
    expect(planCta('growth', 'starter')).toBe('downgrade');
  });

  it('routes enterprise to contact sales (when not already on it)', () => {
    expect(planCta('starter', 'enterprise')).toBe('contact');
  });
});

describe('formatPrice', () => {
  it('formats published prices, free, and custom', () => {
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(199)).toBe('€199');
    expect(formatPrice(null)).toBe('Custom');
  });
});

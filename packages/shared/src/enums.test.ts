import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  GenerationStatusSchema,
  LedgerReasonSchema,
  LocaleSchema,
  PLAN_TIERS,
  PRODUCT_CATEGORIES,
  PlanTierSchema,
  ProductCategorySchema,
} from './enums.js';

describe('enums', () => {
  it('exposes all 14 product categories incl. fashion + other', () => {
    expect(PRODUCT_CATEGORIES).toHaveLength(14);
    expect(PRODUCT_CATEGORIES).toContain('fashion');
    expect(PRODUCT_CATEGORIES).toContain('other');
    expect(ProductCategorySchema.parse('furniture')).toBe('furniture');
    expect(() => ProductCategorySchema.parse('sofa')).toThrow();
  });

  it('generation status includes the refunded terminal state', () => {
    expect(GenerationStatusSchema.parse('refunded')).toBe('refunded');
    expect(() => GenerationStatusSchema.parse('done')).toThrow();
  });

  it('ledger reasons match the architecture enum', () => {
    for (const reason of ['purchase', 'grant', 'generation', 'refund', 'adjustment', 'expiry']) {
      expect(LedgerReasonSchema.parse(reason)).toBe(reason);
    }
  });

  it('plan tiers are free..enterprise', () => {
    expect(PLAN_TIERS[0]).toBe('free');
    expect(PlanTierSchema.parse('scale')).toBe('scale');
  });

  it('locale defaults to en and rejects unsupported locales', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(LocaleSchema.parse('it')).toBe('it');
    expect(() => LocaleSchema.parse('jp')).toThrow();
  });
});

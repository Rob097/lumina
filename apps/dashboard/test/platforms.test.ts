import { describe, expect, it } from 'vitest';
import {
  BRAND_ICON_NAMES,
  CTA_PLATFORMS,
  INSTALL_PLATFORMS,
  ctaForPlatform,
} from '../src/lib/platforms';

describe('INSTALL_PLATFORMS', () => {
  it('leads with the always-available generic script card', () => {
    const first = INSTALL_PLATFORMS[0];
    expect(first?.id).toBe('script');
    expect(first?.status).toBe('available');
  });

  it('marks every named storefront as coming soon', () => {
    const storefronts = INSTALL_PLATFORMS.filter((p) => p.id !== 'script');
    expect(storefronts.length).toBeGreaterThan(0);
    expect(storefronts.every((p) => p.status === 'coming-soon')).toBe(true);
  });

  it('covers WordPress, Shopify and Wix', () => {
    const ids = INSTALL_PLATFORMS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['wordpress', 'shopify', 'wix']));
  });

  it('only references known brand icons', () => {
    for (const p of INSTALL_PLATFORMS) {
      expect(BRAND_ICON_NAMES).toContain(p.brandIcon);
    }
  });
});

describe('ctaForPlatform', () => {
  it('returns the Shopify add-to-cart preset', () => {
    const cta = ctaForPlatform('shopify');
    expect(cta).toEqual({ label: 'Add to cart', urlTemplate: '/cart/add?id={productId}' });
  });

  it('returns the WooCommerce add-to-cart preset', () => {
    expect(ctaForPlatform('woocommerce')?.urlTemplate).toBe('/?add-to-cart={productId}');
  });

  it('returns undefined for an unknown platform', () => {
    expect(ctaForPlatform('myspace')).toBeUndefined();
  });

  it('every CTA preset interpolates a product reference', () => {
    for (const p of CTA_PLATFORMS) {
      expect(p.cta.label.length).toBeGreaterThan(0);
      expect(p.cta.urlTemplate).toMatch(/\{product(Id|Url)\}/);
    }
  });

  it('exposes a generic link option for non-cart storefronts', () => {
    const generic = CTA_PLATFORMS.find((p) => p.id === 'generic');
    expect(generic?.cta.urlTemplate).toBe('{productUrl}');
  });
});

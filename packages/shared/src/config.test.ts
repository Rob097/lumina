import { describe, expect, it } from 'vitest';
import { LuminaConfigSchema, OpenOptionsSchema, ThemeSchema } from './config.js';

describe('LuminaConfig', () => {
  it('requires a siteKey', () => {
    expect(() => LuminaConfigSchema.parse({})).toThrow();
    const cfg = LuminaConfigSchema.parse({ siteKey: 'pk_test_abc' });
    expect(cfg.siteKey).toBe('pk_test_abc');
  });

  it('accepts theme tokens and locale', () => {
    const cfg = LuminaConfigSchema.parse({
      siteKey: 'pk_live_1',
      locale: 'it',
      theme: { accent: '#0F62FE', mode: 'auto', radius: 16, zIndex: 2147483000 },
    });
    expect(cfg.theme?.mode).toBe('auto');
  });

  it('rejects an invalid theme mode', () => {
    expect(() => ThemeSchema.parse({ mode: 'sepia' })).toThrow();
  });
});

describe('OpenOptions', () => {
  it('accepts a registered productId', () => {
    expect(OpenOptionsSchema.parse({ productId: 'SKU-1234' }).productId).toBe('SKU-1234');
  });

  it('accepts an inline product', () => {
    const opts = OpenOptionsSchema.parse({
      product: { name: 'Lampada Aura', imageUrl: 'https://shop.it/aura.png', category: 'lighting' },
    });
    expect(opts.product?.name).toBe('Lampada Aura');
  });

  it('requires either productId or an inline product', () => {
    expect(() => OpenOptionsSchema.parse({ metadata: { variant: 'brass' } })).toThrow();
  });
});

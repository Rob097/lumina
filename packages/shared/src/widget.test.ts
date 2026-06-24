import { describe, expect, it } from 'vitest';
import { WidgetSettingsSchema } from './widget.js';

const VALID = {
  buttonText: 'Try in your room',
  theme: { accent: '#0f62fe', mode: 'auto', radius: 16, fontFamily: 'var(--font-ui)' },
  locale: 'en',
  i18n: { 'upload.title': 'Add a photo of your room' },
  watermark: true,
  resultCta: { label: 'Add to cart', urlTemplate: '/cart/add?id={productId}' },
} as const;

describe('WidgetSettingsSchema', () => {
  it('accepts a fully-specified settings object', () => {
    const cfg = WidgetSettingsSchema.parse(VALID);
    expect(cfg.buttonText).toBe('Try in your room');
    expect(cfg.theme.accent).toBe('#0f62fe');
    expect(cfg.resultCta?.label).toBe('Add to cart');
  });

  it('defaults the pre-upload guide to null and accepts a full guide object', () => {
    expect(WidgetSettingsSchema.parse(VALID).guide).toBeNull();
    const withGuide = WidgetSettingsSchema.parse({
      ...VALID,
      guide: { enabled: true, imageUrl: 'https://cdn.test/pose.png', title: 'Pose like this', body: 'Hold the bag.' },
    });
    expect(withGuide.guide?.enabled).toBe(true);
    expect(withGuide.guide?.imageUrl).toBe('https://cdn.test/pose.png');
  });

  it('rejects a guide image that is not a valid URL', () => {
    expect(() =>
      WidgetSettingsSchema.parse({ ...VALID, guide: { enabled: true, imageUrl: 'not-a-url' } }),
    ).toThrow();
  });

  it('allows a null result CTA and an empty theme/i18n', () => {
    const cfg = WidgetSettingsSchema.parse({
      buttonText: 'Anteprima',
      theme: {},
      locale: 'it',
      i18n: {},
      watermark: false,
      resultCta: null,
    });
    expect(cfg.resultCta).toBeNull();
    expect(cfg.theme.accent).toBeUndefined();
  });

  it('rejects an empty or over-long button label', () => {
    expect(() => WidgetSettingsSchema.parse({ ...VALID, buttonText: '' })).toThrow();
    expect(() => WidgetSettingsSchema.parse({ ...VALID, buttonText: 'x'.repeat(33) })).toThrow();
  });

  it('rejects a non-hex accent color', () => {
    expect(() =>
      WidgetSettingsSchema.parse({ ...VALID, theme: { accent: 'blue' } }),
    ).toThrow();
  });

  it('clamps the corner radius to the 0–24px range', () => {
    expect(() => WidgetSettingsSchema.parse({ ...VALID, theme: { radius: 40 } })).toThrow();
    expect(() => WidgetSettingsSchema.parse({ ...VALID, theme: { radius: -1 } })).toThrow();
  });

  it('rejects an unsupported locale', () => {
    expect(() => WidgetSettingsSchema.parse({ ...VALID, locale: 'pt' })).toThrow();
  });
});

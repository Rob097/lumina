import { describe, it, expect } from 'vitest';
import type { WidgetConfigResponse } from '@lumina/shared';
import { resolveLocale, readScriptDataset, mergeConfig } from '../src/core/config.js';

function remote(overrides: Partial<WidgetConfigResponse> = {}): WidgetConfigResponse {
  return {
    enabled: true,
    theme: { accent: '#111111', mode: 'light', radius: 8 },
    buttonText: 'Try it',
    locale: 'en',
    i18n: {},
    watermark: false,
    limits: { anonDailyCap: 5, maxUploadBytes: 10_485_760, maxImageEdgePx: 2048 },
    resultCta: null,
    guide: null,
    ...overrides,
  };
}

describe('resolveLocale', () => {
  it('prefers an explicit locale', () => {
    expect(resolveLocale('de', 'fr')).toBe('de');
  });

  it('normalizes region + case (it-IT -> it, EN -> en)', () => {
    expect(resolveLocale('it-IT')).toBe('it');
    expect(resolveLocale(null, 'EN')).toBe('en');
  });

  it('falls back from invalid explicit to <html lang>, then to en', () => {
    expect(resolveLocale('xx', 'fr')).toBe('fr');
    expect(resolveLocale('xx', 'zz')).toBe('en');
    expect(resolveLocale()).toBe('en');
  });
});

describe('readScriptDataset', () => {
  it('reads site key, locale and mode from data-* attributes', () => {
    const el = document.createElement('script');
    el.setAttribute('data-site-key', 'pk_test_abc');
    el.setAttribute('data-lumina-locale', 'it');
    el.setAttribute('data-lumina-mode', 'manual');
    const { config, mode } = readScriptDataset(el);
    expect(config.siteKey).toBe('pk_test_abc');
    expect(config.locale).toBe('it');
    expect(mode).toBe('manual');
  });

  it('defaults mode to auto and omits an absent/invalid locale', () => {
    const el = document.createElement('script');
    el.setAttribute('data-site-key', 'pk_test_abc');
    el.setAttribute('data-lumina-locale', 'xx');
    const { config, mode } = readScriptDataset(el);
    expect(mode).toBe('auto');
    expect(config.locale).toBeUndefined();
  });
});

describe('mergeConfig', () => {
  it('local theme/buttonText/locale win over the remote defaults', () => {
    const eff = mergeConfig(
      { siteKey: 'pk', locale: 'fr', buttonText: 'Provalo', theme: { accent: '#FF0000' } },
      remote(),
    );
    expect(eff.locale).toBe('fr');
    expect(eff.buttonText).toBe('Provalo');
    expect(eff.theme.accent).toBe('#FF0000');
    // remote theme tokens the local config didn't set are preserved
    expect(eff.theme.radius).toBe(8);
  });

  it('takes enabled/limits/resultCta/i18n from the remote config', () => {
    const cta = { label: 'Add to cart', urlTemplate: 'https://shop/cart/{id}' };
    const eff = mergeConfig(
      { siteKey: 'pk' },
      remote({ enabled: false, resultCta: cta, i18n: { 'result.save': 'Keep' } }),
    );
    expect(eff.enabled).toBe(false);
    expect(eff.resultCta).toEqual(cta);
    expect(eff.i18n['result.save']).toBe('Keep');
    expect(eff.limits.maxImageEdgePx).toBe(2048);
  });

  it('forces the watermark on when the remote (free plan) requires it', () => {
    const eff = mergeConfig({ siteKey: 'pk', watermark: false }, remote({ watermark: true }));
    expect(eff.watermark).toBe(true);
  });

  it('takes the pre-upload guide from the remote config (server-owned), defaulting to null', () => {
    expect(mergeConfig({ siteKey: 'pk' }, remote()).guide).toBeNull();
    const guide = { enabled: true, imageUrl: 'https://cdn.test/pose.png', title: 'Pose like this' };
    const eff = mergeConfig({ siteKey: 'pk' }, remote({ guide }));
    expect(eff.guide).toEqual(guide);
  });

  // The merchant's dashboard locale is authoritative: a host page's <html lang> (passed as the
  // page-locale fallback) must NOT override it — only an explicit data-attr/init locale may.
  it('prefers the merchant (remote) locale over the page <html lang> fallback', () => {
    const eff = mergeConfig({ siteKey: 'pk' }, remote({ locale: 'en' }), 'it');
    expect(eff.locale).toBe('en');
  });

  it('lets an explicit local locale override both the remote and the page fallback', () => {
    const eff = mergeConfig({ siteKey: 'pk', locale: 'fr' }, remote({ locale: 'en' }), 'it');
    expect(eff.locale).toBe('fr');
  });
});

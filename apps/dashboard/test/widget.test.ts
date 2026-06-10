import { describe, expect, it } from 'vitest';
import type { WidgetSettings } from '@lumina/shared';
import {
  buildInstallSnippet,
  buildTriggerSnippet,
  hexToRgba,
  isDarkPreview,
  previewVars,
} from '../src/lib/widget';

const BASE: WidgetSettings = {
  buttonText: 'Try in your room',
  theme: {},
  locale: 'en',
  i18n: {},
  watermark: true,
  resultCta: null,
};

describe('hexToRgba', () => {
  it('expands a #rrggbb hex into an rgba() string', () => {
    expect(hexToRgba('#0f62fe', 0.12)).toBe('rgba(15, 98, 254, 0.12)');
    expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
  });
});

describe('previewVars', () => {
  it('falls back to LUMINA defaults for an empty theme', () => {
    const v = previewVars(BASE);
    expect(v['--wp-accent']).toBe('#0f62fe');
    expect(v['--wp-accent-weak']).toBe('rgba(15, 98, 254, 0.12)');
    expect(v['--wp-radius']).toBe('16px');
    expect(v['--wp-font']).toBe('var(--font-ui)');
  });

  it('derives the css vars from a customized theme', () => {
    const v = previewVars({
      ...BASE,
      theme: { accent: '#be185d', radius: 4, fontFamily: 'Georgia, serif' },
    });
    expect(v['--wp-accent']).toBe('#be185d');
    expect(v['--wp-accent-weak']).toBe('rgba(190, 24, 93, 0.12)');
    expect(v['--wp-radius']).toBe('4px');
    expect(v['--wp-font']).toBe('Georgia, serif');
  });
});

describe('isDarkPreview', () => {
  it('is dark only when the mode is explicitly dark', () => {
    expect(isDarkPreview('dark')).toBe(true);
    expect(isDarkPreview('light')).toBe(false);
    expect(isDarkPreview('auto')).toBe(false);
    expect(isDarkPreview(undefined)).toBe(false);
  });
});

describe('buildInstallSnippet', () => {
  it('emits the one-line loader script with the site key', () => {
    expect(buildInstallSnippet({ cdnUrl: 'https://cdn.lumina.app', siteKey: 'pk_live_abc' })).toBe(
      '<script async src="https://cdn.lumina.app/widget.js" data-site-key="pk_live_abc"></script>',
    );
  });

  it('trims a trailing slash on the cdn base', () => {
    expect(buildInstallSnippet({ cdnUrl: 'https://cdn.lumina.app/', siteKey: 'pk_test_x' })).toBe(
      '<script async src="https://cdn.lumina.app/widget.js" data-site-key="pk_test_x"></script>',
    );
  });
});

describe('buildTriggerSnippet', () => {
  it('builds a placeholder the widget fills with the styled button, scoped to a product', () => {
    expect(buildTriggerSnippet({ productId: 'AURA-01' })).toBe(
      '<div data-lumina-button data-lumina-product="AURA-01"></div>',
    );
  });

  it('uses a placeholder product id when none is given', () => {
    expect(buildTriggerSnippet({})).toContain('data-lumina-product="YOUR_PRODUCT_ID"');
  });
});

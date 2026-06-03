import { describe, it, expect } from 'vitest';
import { LOCALES, GENERATION_STAGES } from '@lumina/shared';
import {
  STRINGS,
  STRING_KEYS,
  t,
  applyOverrides,
  createTranslator,
  stageStringKey,
} from '../src/core/i18n.js';

describe('i18n', () => {
  it('returns the localized string for a key', () => {
    expect(t('en', 'result.save')).toBe('Save');
    expect(t('it', 'result.save')).toBe('Salva');
  });

  it('interpolates {var} tokens', () => {
    expect(t('en', 'confirm.title', { product: 'Aura Lamp' })).toContain('Aura Lamp');
    // a leftover token with no matching var is left intact
    expect(t('en', 'confirm.title')).toContain('{product}');
  });

  it('falls back to English for an unknown locale, then to the key for an unknown key', () => {
    expect(t('xx' as never, 'result.save')).toBe('Save');
    expect(t('en', 'totally.missing' as never)).toBe('totally.missing');
  });

  it('applyOverrides merges remote overrides over the base table', () => {
    const merged = applyOverrides(STRINGS.en, { 'result.save': 'Keep it' });
    expect(merged['result.save']).toBe('Keep it');
    expect(merged['result.share']).toBe(STRINGS.en['result.share']);
  });

  it('createTranslator binds locale + overrides', () => {
    const tr = createTranslator('it', { 'result.save': 'Conserva' });
    expect(tr('result.save')).toBe('Conserva');
    expect(tr('result.share')).toBe(STRINGS.it['result.share']);
  });

  it('maps each generation stage to a string key that exists', () => {
    for (const stage of GENERATION_STAGES) {
      const key = stageStringKey(stage);
      expect(STRINGS.en[key]).toBeTruthy();
    }
  });

  it('every locale defines every key (no missing translations)', () => {
    for (const locale of LOCALES) {
      for (const key of STRING_KEYS) {
        expect(STRINGS[locale][key], `${locale}/${key}`).toBeTruthy();
      }
    }
  });
});

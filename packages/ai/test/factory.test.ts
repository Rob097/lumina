import { describe, expect, it } from 'vitest';
import { buildComposeChains, selectFalFallback } from '../src/factory.js';
import type { AIProvider } from '../src/types.js';

const stub = (name: string): AIProvider => ({
  name,
  compose: async () => ({ bytes: new Uint8Array(), contentType: 'image/jpeg', model: name, costCents: 0 }),
});

describe('selectFalFallback', () => {
  it('returns undefined when FAL_KEY is absent (no fal, no crash, gemini-only)', () => {
    expect(selectFalFallback({})).toBeUndefined();
  });

  it('returns a fal Seedream provider when FAL_KEY is present', () => {
    const fal = selectFalFallback({ FAL_KEY: 'k' });
    expect(fal?.name).toBe('fal-seedream');
  });
});

describe('buildComposeChains — fal as an equivalent cross-provider fallback', () => {
  const quality = stub('gateway-quality');
  const fast = stub('gateway-fast');
  const fal = stub('fal-seedream');

  it('keeps the proven gemini order and appends fal as the LAST fallback in every policy', () => {
    const chains = buildComposeChains(quality, fast, fal);
    expect(chains.quality.map((p) => p.name)).toEqual([
      'gateway-quality',
      'gateway-fast',
      'fal-seedream',
    ]);
    expect(chains.balanced.map((p) => p.name)).toEqual([
      'gateway-quality',
      'gateway-fast',
      'fal-seedream',
    ]);
    // fast policy leads with the fast model but still ends at the cross-provider safety net.
    expect(chains.fast.map((p) => p.name)).toEqual([
      'gateway-fast',
      'gateway-quality',
      'fal-seedream',
    ]);
  });

  it('omits the fal slot entirely when no fallback is configured (gemini-only chains)', () => {
    const chains = buildComposeChains(quality, fast);
    expect(chains.quality.map((p) => p.name)).toEqual(['gateway-quality', 'gateway-fast']);
    expect(chains.fast.map((p) => p.name)).toEqual(['gateway-fast', 'gateway-quality']);
    expect(chains.balanced.some((p) => p.name === 'fal-seedream')).toBe(false);
  });

  it('puts fal FIRST across every policy when primary=fal (fal leads, gemini becomes the fallback)', () => {
    const chains = buildComposeChains(quality, fast, fal, { primary: 'fal' });
    expect(chains.quality.map((p) => p.name)).toEqual([
      'fal-seedream',
      'gateway-quality',
      'gateway-fast',
    ]);
    expect(chains.balanced.map((p) => p.name)).toEqual([
      'fal-seedream',
      'gateway-quality',
      'gateway-fast',
    ]);
    expect(chains.fast.map((p) => p.name)).toEqual([
      'fal-seedream',
      'gateway-fast',
      'gateway-quality',
    ]);
  });

  it('ignores primary=fal when no fal is configured (stays the proven gemini-first order)', () => {
    const chains = buildComposeChains(quality, fast, undefined, { primary: 'fal' });
    expect(chains.quality.map((p) => p.name)).toEqual(['gateway-quality', 'gateway-fast']);
  });
});

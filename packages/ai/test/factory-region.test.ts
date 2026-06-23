import { describe, expect, it } from 'vitest';
import { selectRegionChain } from '../src/factory.js';
import { FalProvider } from '../src/providers/fal.js';
import { MockProvider } from '../src/providers/mock.js';

describe('selectRegionChain (env → draw-to-place region chain)', () => {
  const fallback = new MockProvider({ name: 'gateway-quality', model: 'gemini' });

  it('falls back to [fallback] when FAL_KEY is absent', () => {
    const chain = selectRegionChain({}, fallback);
    expect(chain.map((p) => p.name)).toEqual(['gateway-quality']);
  });

  it('puts the fal Seedream provider first and the fallback second when FAL_KEY is set', () => {
    const chain = selectRegionChain({ FAL_KEY: 'id:secret' }, fallback);
    expect(chain[0]).toBeInstanceOf(FalProvider);
    expect(chain[0]!.name).toBe('fal-seedream');
    expect(chain[1]).toBe(fallback);
  });

  it('honours FAL_IMAGE_MODEL override', () => {
    const chain = selectRegionChain({ FAL_KEY: 'k', FAL_IMAGE_MODEL: 'fal-ai/x/edit' }, fallback);
    expect(chain[0]).toBeInstanceOf(FalProvider);
  });
});

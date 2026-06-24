import { describe, expect, it } from 'vitest';
import type { GenerationPlan } from '@lumina/shared';
import { resolvePolicy, resolvePolicyFashion, resolveImageSizes } from '../src/routing.js';

function plan(quality: Partial<GenerationPlan['sceneFacts']['quality']> = {}, confidence = 0.8): GenerationPlan {
  return {
    mode: 'object_placement',
    target: { description: 'x' },
    repetition: { kind: 'single' },
    scale: {},
    sceneFacts: {
      isExterior: false,
      lighting: { direction: 'top-left', intensity: 'medium' },
      surfaces: [],
      tiltDegrees: 0,
      quality: { blurry: false, dark: false, cluttered: false, ...quality },
    },
    confidence,
  };
}

describe('resolvePolicy', () => {
  it('defaults the common path to the fast model for an easy scene', () => {
    expect(resolvePolicy('starter', plan())).toBe('fast');
    expect(resolvePolicy('growth', plan())).toBe('fast');
  });

  it('escalates to the quality model on a difficult scene', () => {
    expect(resolvePolicy('starter', plan({ blurry: true }))).toBe('quality');
    expect(resolvePolicy('starter', plan({ dark: true }))).toBe('quality');
    expect(resolvePolicy('starter', plan({ cluttered: true }))).toBe('quality');
  });

  it('escalates to the quality model on a low-confidence plan', () => {
    expect(resolvePolicy('starter', plan({}, 0.2))).toBe('quality');
  });

  it('always uses the quality model for the top plan tiers', () => {
    expect(resolvePolicy('scale', plan())).toBe('quality');
    expect(resolvePolicy('enterprise', plan())).toBe('quality');
  });

  it('keeps the free tier on the fast model even for a difficult scene (cost-controlled, watermarked)', () => {
    expect(resolvePolicy('free', plan())).toBe('fast');
    expect(resolvePolicy('free', plan({ dark: true }, 0.1))).toBe('fast');
  });
});

describe('resolvePolicyFashion', () => {
  it('defaults the person path to the fast tier (the face comes from the original pixels via the composite)', () => {
    expect(resolvePolicyFashion('starter')).toBe('fast');
    expect(resolvePolicyFashion('growth')).toBe('fast');
    // no GenerationPlan to escalate on (planner skipped) → fast even for the top tier, unlike furniture
    expect(resolvePolicyFashion('enterprise')).toBe('fast');
  });

  it('keeps the free tier fast regardless of the quality flag', () => {
    expect(resolvePolicyFashion('free')).toBe('fast');
    expect(resolvePolicyFashion('free', true)).toBe('fast');
  });

  it('forces the quality model store-wide when the flag is set (except free)', () => {
    expect(resolvePolicyFashion('starter', true)).toBe('quality');
    expect(resolvePolicyFashion('enterprise', true)).toBe('quality');
  });
});

describe('resolveImageSizes', () => {
  it('defaults the fast path to 1K and the quality path to 2K', () => {
    expect(resolveImageSizes({})).toEqual({ fast: '1K', quality: '2K' });
  });

  it('honours env overrides per tier', () => {
    expect(resolveImageSizes({ GATEWAY_IMAGE_SIZE_FAST: '2K', GATEWAY_IMAGE_SIZE: '4K' })).toEqual({
      fast: '2K',
      quality: '4K',
    });
  });
});

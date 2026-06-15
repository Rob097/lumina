import { describe, expect, it } from 'vitest';
import { classifyInput, classifyOutput, DEFAULT_MODERATION_THRESHOLDS } from '../src/moderation.js';
import type { ImageSignals } from '../src/moderation.js';

const safe: ImageSignals = { sceneScore: 0.92, faceAreaRatio: 0.02, nsfwScore: 0.01 };

describe('classifyInput', () => {
  it('passes a clean interior environment', () => {
    expect(classifyInput(safe, 'lighting')).toEqual({ ok: true });
  });

  it('passes an exterior environment (facade/garden) — high scene score', () => {
    expect(classifyInput({ ...safe, sceneScore: 0.8 }, 'outdoor')).toEqual({ ok: true });
  });

  it('rejects a non-environment photo (selfie/document/meme)', () => {
    const v = classifyInput({ ...safe, sceneScore: 0.2 }, 'furniture');
    expect(v).toEqual({ ok: false, reason: 'not_environment' });
  });

  it('rejects a face-dominant photo for non-fashion categories', () => {
    const v = classifyInput({ ...safe, faceAreaRatio: 0.6 }, 'furniture');
    expect(v).toEqual({ ok: false, reason: 'face_dominant' });
  });

  it('allows a face-dominant photo for the fashion category', () => {
    expect(classifyInput({ ...safe, faceAreaRatio: 0.6 }, 'fashion')).toEqual({ ok: true });
  });

  it('rejects unsafe content regardless of category, before other checks', () => {
    const v = classifyInput({ sceneScore: 0.0, faceAreaRatio: 0.9, nsfwScore: 0.95 }, 'fashion');
    expect(v).toEqual({ ok: false, reason: 'unsafe' });
  });
});

describe('classifyOutput', () => {
  it('passes a safe composite', () => {
    expect(classifyOutput(safe)).toEqual({ ok: true });
  });

  it('blocks an unsafe composite', () => {
    expect(classifyOutput({ ...safe, nsfwScore: 0.99 })).toEqual({ ok: false, reason: 'unsafe' });
  });
});

describe('DEFAULT_MODERATION_THRESHOLDS', () => {
  it('exposes tunable thresholds', () => {
    expect(DEFAULT_MODERATION_THRESHOLDS.minScene).toBeGreaterThan(0);
    expect(DEFAULT_MODERATION_THRESHOLDS.maxFaceRatioNonFashion).toBeLessThan(1);
  });
});

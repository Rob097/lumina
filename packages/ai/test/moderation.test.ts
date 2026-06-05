import { describe, expect, it } from 'vitest';
import { classifyInput, classifyOutput, DEFAULT_MODERATION_THRESHOLDS } from '../src/moderation.js';
import type { ImageSignals } from '../src/moderation.js';

const safe: ImageSignals = { interiorScore: 0.92, faceAreaRatio: 0.02, nsfwScore: 0.01 };

describe('classifyInput', () => {
  it('passes a clean interior room', () => {
    expect(classifyInput(safe, 'lighting')).toEqual({ ok: true });
  });

  it('rejects a non-interior room photo', () => {
    const v = classifyInput({ ...safe, interiorScore: 0.2 }, 'furniture');
    expect(v).toEqual({ ok: false, reason: 'not_interior' });
  });

  it('rejects a face-dominant photo for non-fashion categories', () => {
    const v = classifyInput({ ...safe, faceAreaRatio: 0.6 }, 'furniture');
    expect(v).toEqual({ ok: false, reason: 'face_dominant' });
  });

  it('allows a face-dominant photo for the fashion category', () => {
    expect(classifyInput({ ...safe, faceAreaRatio: 0.6 }, 'fashion')).toEqual({ ok: true });
  });

  it('rejects unsafe content regardless of category, before other checks', () => {
    const v = classifyInput({ interiorScore: 0.0, faceAreaRatio: 0.9, nsfwScore: 0.95 }, 'fashion');
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
    expect(DEFAULT_MODERATION_THRESHOLDS.minInterior).toBeGreaterThan(0);
    expect(DEFAULT_MODERATION_THRESHOLDS.maxFaceRatioNonFashion).toBeLessThan(1);
  });
});

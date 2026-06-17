import { describe, expect, it } from 'vitest';
import { SceneAnalysisSchema } from './scene.js';

const valid = {
  isExterior: false,
  lighting: { direction: 'top-left', temperatureK: 4000, intensity: 'medium' },
  surfaces: [{ kind: 'floor' }, { kind: 'wall', orientation: 'back wall' }],
  tiltDegrees: -3.5,
  roomScale: { ceilingHeightM: 2.6, referenceObjects: ['door', 'sofa'] },
  suggestedPlacement: { region: 'against the back wall', bbox: [0.1, 0.2, 0.5, 0.9] as const },
  quality: { blurry: false, dark: false, cluttered: false },
  confidence: 0.8,
};

describe('SceneAnalysisSchema', () => {
  it('parses a full, valid analysis', () => {
    const parsed = SceneAnalysisSchema.parse(valid);
    expect(parsed.isExterior).toBe(false);
    expect(parsed.lighting.direction).toBe('top-left');
    expect(parsed.lighting.temperatureK).toBe(4000);
    expect(parsed.surfaces).toHaveLength(2);
    expect(parsed.tiltDegrees).toBeCloseTo(-3.5);
    expect(parsed.roomScale?.ceilingHeightM).toBe(2.6);
    expect(parsed.suggestedPlacement?.region).toContain('back wall');
  });

  it('accepts a minimal analysis (optional blocks omitted)', () => {
    const parsed = SceneAnalysisSchema.parse({
      isExterior: true,
      lighting: { direction: 'ambient', intensity: 'low' },
      surfaces: [],
      tiltDegrees: 0,
      quality: { blurry: true, dark: true, cluttered: false },
      confidence: 0.2,
    });
    expect(parsed.roomScale).toBeUndefined();
    expect(parsed.suggestedPlacement).toBeUndefined();
    expect(parsed.lighting.temperatureK).toBeUndefined();
  });

  it('accepts bbox as a plain number array (Gemini response_schema rejects tuple `items`)', () => {
    // Regression: a `z.tuple` serialises to JSON-Schema `items: [...]` which Gemini's structured-output
    // proto rejects ("Proto field is not repeating, cannot start list"), silently killing scene analysis.
    // bbox must therefore be a plain repeating array, not a fixed 4-tuple.
    const parsed = SceneAnalysisSchema.parse({
      ...valid,
      suggestedPlacement: { region: 'on the floor', bbox: [0.1, 0.9] },
    });
    expect(parsed.suggestedPlacement?.bbox).toEqual([0.1, 0.9]);
  });

  it('rejects an out-of-range confidence', () => {
    expect(() => SceneAnalysisSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });

  it('rejects an unknown light direction', () => {
    expect(() =>
      SceneAnalysisSchema.parse({ ...valid, lighting: { ...valid.lighting, direction: 'sideways' } }),
    ).toThrow();
  });

  it('rejects a missing required flag', () => {
    const { isExterior: _omit, ...rest } = valid;
    expect(() => SceneAnalysisSchema.parse(rest)).toThrow();
  });
});

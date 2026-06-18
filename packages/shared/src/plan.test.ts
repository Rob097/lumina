import { describe, expect, it } from 'vitest';
import { GenerationPlanSchema, neutralGenerationPlan } from './plan.js';

const valid = {
  mode: 'surface_covering',
  target: { description: 'the main wall behind the bed', bbox: [0.0, 0.1, 1.0, 0.8] },
  repetition: { kind: 'grid', estimatedCount: 12 },
  scale: { productDimensionsCm: { w: 60, h: 60, d: 0.5 }, sceneScaleHint: 'ceiling ~2.7m' },
  sceneFacts: {
    isExterior: false,
    lighting: { direction: 'top-left', temperatureK: 4000, intensity: 'medium' },
    surfaces: [{ kind: 'wall', orientation: 'back wall' }],
    tiltDegrees: -2,
    quality: { blurry: false, dark: false, cluttered: false },
  },
  notes: 'panel reads as a slatted acoustic surfacing unit',
  confidence: 0.82,
};

describe('GenerationPlanSchema', () => {
  it('parses a full, valid surface_covering plan', () => {
    const p = GenerationPlanSchema.parse(valid);
    expect(p.mode).toBe('surface_covering');
    expect(p.target.description).toContain('wall');
    expect(p.repetition.kind).toBe('grid');
    expect(p.repetition.estimatedCount).toBe(12);
    expect(p.sceneFacts.lighting.direction).toBe('top-left');
    expect(p.scale.productDimensionsCm?.w).toBe(60);
  });

  it('accepts a minimal object_placement plan (optionals omitted)', () => {
    const p = GenerationPlanSchema.parse({
      mode: 'object_placement',
      target: { description: 'beside the sofa' },
      repetition: { kind: 'single' },
      scale: {},
      sceneFacts: {
        isExterior: true,
        lighting: { direction: 'ambient', intensity: 'low' },
        surfaces: [],
        tiltDegrees: 0,
        quality: { blurry: true, dark: false, cluttered: false },
      },
      confidence: 0.3,
    });
    expect(p.target.bbox).toBeUndefined();
    expect(p.repetition.estimatedCount).toBeUndefined();
    expect(p.scale.productDimensionsCm).toBeUndefined();
  });

  it('accepts bbox as a plain number array (Gemini response_schema rejects tuple `items`)', () => {
    const p = GenerationPlanSchema.parse({ ...valid, target: { description: 'the floor', bbox: [0.2, 0.8] } });
    expect(p.target.bbox).toEqual([0.2, 0.8]);
  });

  it('clamps estimatedCount into [1, 999] (rounds) instead of rejecting', () => {
    const count = (n: number): number | undefined =>
      GenerationPlanSchema.parse({ ...valid, repetition: { kind: 'grid', estimatedCount: n } }).repetition.estimatedCount;
    expect(count(5000)).toBe(999);
    expect(count(0)).toBe(1);
    expect(count(3.7)).toBe(4);
  });

  it('rejects an unknown mode', () => {
    expect(() => GenerationPlanSchema.parse({ ...valid, mode: 'teleport' })).toThrow();
  });

  it('rejects an unknown repetition kind', () => {
    expect(() => GenerationPlanSchema.parse({ ...valid, repetition: { kind: 'spiral' } })).toThrow();
  });

  it('rejects an out-of-range confidence', () => {
    expect(() => GenerationPlanSchema.parse({ ...valid, confidence: 1.5 })).toThrow();
  });
});

describe('neutralGenerationPlan', () => {
  it('is a valid, zero-confidence object_placement plan with no extra facts', () => {
    const p = neutralGenerationPlan();
    expect(() => GenerationPlanSchema.parse(p)).not.toThrow();
    expect(p.mode).toBe('object_placement');
    expect(p.repetition.kind).toBe('single');
    expect(p.confidence).toBe(0);
    expect(p.sceneFacts.surfaces).toEqual([]);
    expect(p.sceneFacts.isExterior).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { neutralGenerationPlan, type GenerationPlan } from '@lumina/shared';
import { planToSceneAnalysis } from '../src/planning.js';

const plan: GenerationPlan = {
  mode: 'surface_covering',
  target: { description: 'the main wall', bbox: [0, 0.1, 1, 0.8] },
  repetition: { kind: 'grid', estimatedCount: 12 },
  scale: { productDimensionsCm: { w: 60, h: 60 } },
  sceneFacts: {
    isExterior: false,
    lighting: { direction: 'top-left', temperatureK: 4000, intensity: 'medium' },
    surfaces: [{ kind: 'wall', orientation: 'back wall' }],
    tiltDegrees: -2,
    quality: { blurry: false, dark: false, cluttered: false },
  },
  confidence: 0.82,
};

describe('planToSceneAnalysis', () => {
  it('maps the plan sceneFacts + target into the SceneAnalysis the compositor consumes', () => {
    const sa = planToSceneAnalysis(plan);
    expect(sa.isExterior).toBe(false);
    expect(sa.lighting.direction).toBe('top-left');
    expect(sa.surfaces).toHaveLength(1);
    expect(sa.tiltDegrees).toBe(-2);
    expect(sa.confidence).toBe(0.82);
    expect(sa.suggestedPlacement?.region).toBe('the main wall');
    expect(sa.suggestedPlacement?.bbox).toEqual([0, 0.1, 1, 0.8]);
  });

  it('omits bbox when the plan target has none (neutral plan)', () => {
    const sa = planToSceneAnalysis(neutralGenerationPlan());
    expect(sa.suggestedPlacement?.bbox).toBeUndefined();
    expect(sa.confidence).toBe(0);
  });
});

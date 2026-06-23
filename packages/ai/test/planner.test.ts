import { describe, expect, it, vi } from 'vitest';
import type { GenerationPlan } from '@lumina/shared';
import { buildPlannerPrompt } from '../src/prompts/planner.js';
import { GatewayPlannerProvider } from '../src/providers/gateway-planner.js';
import type { PlannerInput } from '../src/types.js';

const input: PlannerInput = {
  room: { url: 'https://x/room.jpg' },
  product: { url: 'https://x/product.png' },
  productName: 'Acoustic wood panel',
  dimensions: { w: 60, h: 60, d: 0.5, unit: 'cm' },
  category: 'decor',
};

const plan: GenerationPlan = {
  mode: 'surface_covering',
  target: { description: 'the main wall' },
  repetition: { kind: 'grid', estimatedCount: 10 },
  scale: { productDimensionsCm: { w: 60, h: 60, d: 0.5 } },
  sceneFacts: {
    isExterior: false,
    lighting: { direction: 'top-left', intensity: 'medium' },
    surfaces: [{ kind: 'wall' }],
    tiltDegrees: 0,
    quality: { blurry: false, dark: false, cluttered: false },
  },
  confidence: 0.8,
};

describe('buildPlannerPrompt', () => {
  it('asks the model to decide the OPERATION (covering / replacement / placement), not a category', () => {
    const p = buildPlannerPrompt(input);
    expect(p).toMatch(/surface_covering/);
    expect(p).toMatch(/object_replacement/);
    expect(p).toMatch(/object_placement/);
    expect(p).toMatch(/operation|mode/i);
  });

  it('references BOTH images (scene + product) and asks for a strict JSON plan with confidence', () => {
    const p = buildPlannerPrompt(input);
    expect(p).toMatch(/SCENE/);
    expect(p).toMatch(/PRODUCT/);
    expect(p).toMatch(/JSON/i);
    expect(p).toMatch(/confidence/i);
  });

  it('feeds the known product metadata (name, dimensions) as facts to reason over', () => {
    const p = buildPlannerPrompt(input);
    expect(p).toContain('Acoustic wood panel');
    expect(p).toMatch(/60/); // dimensions echoed
  });

  it('asks for a productAnalysis: what the product is, its visual identity, how it installs, its scale', () => {
    const p = buildPlannerPrompt(input);
    expect(p).toMatch(/productAnalysis/);
    expect(p).toMatch(/identity|material|colou?r|installed|placed|finish/i);
  });
});

describe('GatewayPlannerProvider', () => {
  it('forwards the model + prompt + BOTH images to the runner and returns the plan', async () => {
    const run = vi.fn().mockResolvedValue(plan);
    const provider = new GatewayPlannerProvider({ model: 'google/gemini-2.5-flash', run });

    const result = await provider.plan(input);

    expect(result).toEqual(plan);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'google/gemini-2.5-flash', room: input.room, product: input.product }),
    );
    const prompt = run.mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt.length).toBeGreaterThan(0);
  });
});

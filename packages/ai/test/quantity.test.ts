import { describe, expect, it, vi } from 'vitest';
import { AIOrchestrator } from '../src/orchestrator.js';
import { MockProvider, MockQuantityProvider } from '../src/providers/mock.js';
import { GatewayQuantityProvider } from '../src/providers/gateway-quantity.js';
import {
  COVERAGE_CATEGORIES,
  MAX_SUGGESTED_QUANTITY,
  buildQuantityPrompt,
  clampQuantity,
  isCoverageCategory,
} from '../src/quantity.js';
import type { AIProvider, QuantityInput, RoutingPolicy } from '../src/types.js';

const chains = (p: AIProvider): Record<RoutingPolicy, AIProvider[]> => ({
  quality: [p],
  balanced: [p],
  fast: [p],
});

const tilesInput: QuantityInput = {
  room: { url: 'https://x/room.jpg' },
  category: 'tiles',
  dimensions: { w: 30, h: 30, unit: 'cm' },
  productName: 'Marble tile',
};

describe('coverage gating', () => {
  it('treats tiles/decor/renovation/outdoor as coverage and the rest as single-unit', () => {
    expect([...COVERAGE_CATEGORIES].sort()).toEqual(['decor', 'outdoor', 'renovation', 'tiles']);
    expect(isCoverageCategory('tiles')).toBe(true);
    expect(isCoverageCategory('furniture')).toBe(false);
    expect(isCoverageCategory('shower')).toBe(false);
  });

  it('clamps a raw model number to a sane integer range', () => {
    expect(clampQuantity(5.4)).toBe(5);
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-3)).toBe(1);
    expect(clampQuantity(1e9)).toBe(MAX_SUGGESTED_QUANTITY);
    expect(clampQuantity(Number.NaN)).toBe(1);
  });
});

describe('AIOrchestrator.estimateQuantity', () => {
  it('short-circuits single-unit categories to 1 with no provider call', async () => {
    const quantity = new MockQuantityProvider();
    const orch = new AIOrchestrator({ chains: chains(new MockProvider({ name: 'm' })), quantity });
    const est = await orch.estimateQuantity({ room: { url: 'https://x/r.jpg' }, category: 'furniture' });
    expect(est).toEqual(expect.objectContaining({ suggestedQuantity: 1, isCoverage: false }));
    expect(quantity.callCount).toBe(0);
  });

  it('returns null for a coverage category when no quantity provider is configured', async () => {
    const orch = new AIOrchestrator({ chains: chains(new MockProvider({ name: 'm' })) });
    expect(await orch.estimateQuantity(tilesInput)).toBeNull();
  });

  it('calls the provider with a category-aware prompt for coverage categories', async () => {
    const quantity = new MockQuantityProvider({ suggestedQuantity: 12, unit: 'tiles' });
    const spy = vi.spyOn(quantity, 'estimateQuantity');
    const orch = new AIOrchestrator({ chains: chains(new MockProvider({ name: 'm' })), quantity });
    const est = await orch.estimateQuantity(tilesInput);
    expect(est).toEqual(
      expect.objectContaining({ suggestedQuantity: 12, isCoverage: true, unit: 'tiles' }),
    );
    expect(quantity.callCount).toBe(1);
    expect(spy.mock.calls[0]?.[1]).toContain('tiles');
  });
});

describe('GatewayQuantityProvider', () => {
  it('rounds/clamps the model number and marks the estimate as coverage', async () => {
    const run = vi.fn(async () => ({
      suggestedQuantity: 7.8,
      unit: 'panels',
      rationale: 'covers the wall',
      confidence: 0.7,
    }));
    const provider = new GatewayQuantityProvider({ model: 'test/vision', run });
    const est = await provider.estimateQuantity(tilesInput, 'prompt');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test/vision', prompt: 'prompt', room: tilesInput.room }),
    );
    expect(est).toEqual({
      suggestedQuantity: 8,
      unit: 'panels',
      isCoverage: true,
      rationale: 'covers the wall',
      confidence: 0.7,
    });
  });
});

describe('buildQuantityPrompt', () => {
  it('includes the category and flags missing dimensions', () => {
    expect(buildQuantityPrompt({ room: { url: 'x' }, category: 'decor' })).toContain(
      'dimensions are unknown',
    );
    expect(buildQuantityPrompt(tilesInput)).toContain('30cm');
  });
});

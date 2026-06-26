import type { FashionPlacement } from '@lumina/shared';
import { describe, expect, it, vi } from 'vitest';
import { selectPlacementDetector } from '../src/factory.js';
import { AIOrchestrator } from '../src/orchestrator.js';
import { buildPlacementPrompt } from '../src/prompts/placement.js';
import { GatewayPlacementProvider, MockPlacementDetector } from '../src/providers/gateway-placement.js';
import type { PlacementDetectorInput } from '../src/types.js';

const input: PlacementDetectorInput = {
  subject: { url: 'https://x/selfie.jpg' },
  product: { url: 'https://x/bag.png' },
  category: 'fashion',
};
const sample: FashionPlacement = {
  found: true,
  carry: 'forearm',
  armSide: 'left',
  anchor: { x: 0.3, y: 0.5 },
  shoulderWidthNorm: 0.45,
  parts: [{ label: 'left hand', box: { x: 0.25, y: 0.45, w: 0.1, h: 0.1 } }],
};

describe('buildPlacementPrompt', () => {
  it('asks for the JSON fields with a clear coordinate convention and no image generation', () => {
    const p = buildPlacementPrompt(input).toLowerCase();
    expect(p).toMatch(/carry/);
    expect(p).toMatch(/armside/);
    expect(p).toMatch(/anchor/);
    expect(p).toMatch(/shoulderwidthnorm/);
    expect(p).toMatch(/fraction|normalized/);
    expect(p).toMatch(/do not generate/);
    expect(p).toMatch(/parts|bounding box/); // concrete object detection, not an abstract point
  });
  it('passes the merchant category hint through', () => {
    expect(buildPlacementPrompt(input)).toContain('fashion');
  });
});

describe('GatewayPlacementProvider', () => {
  it('sends the subject + product to the runner and returns the validated placement', async () => {
    const run = vi.fn(async () => sample);
    const provider = new GatewayPlacementProvider({ model: 'google/gemini-2.5-flash', run });
    const out = await provider.detect(input);
    expect(out).toEqual(sample);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'google/gemini-2.5-flash', subject: input.subject, product: input.product }),
    );
  });
});

describe('MockPlacementDetector', () => {
  it('reports no placement so the workflow falls back to the generative path', async () => {
    expect((await new MockPlacementDetector().detect(input)).found).toBe(false);
  });
});

describe('AIOrchestrator.detectPlacement', () => {
  const chains = { quality: [], balanced: [], fast: [] };
  it('returns null when no detector is configured', async () => {
    expect(await new AIOrchestrator({ chains }).detectPlacement(input)).toBeNull();
  });
  it('delegates to the configured detector', async () => {
    const orch = new AIOrchestrator({ chains, detector: { detect: async () => sample } });
    expect(await orch.detectPlacement(input)).toEqual(sample);
  });
});

describe('selectPlacementDetector', () => {
  it('is the mock offline or under AI_PROVIDER=mock', () => {
    expect(selectPlacementDetector({}).constructor.name).toBe('MockPlacementDetector');
    expect(selectPlacementDetector({ AI_GATEWAY_API_KEY: 'k', AI_PROVIDER: 'mock' }).constructor.name).toBe(
      'MockPlacementDetector',
    );
  });
  it('is the gateway detector when creds are present', () => {
    expect(selectPlacementDetector({ AI_GATEWAY_API_KEY: 'k' }).constructor.name).toBe('GatewayPlacementProvider');
  });
});

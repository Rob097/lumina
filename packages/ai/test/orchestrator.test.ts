import { describe, expect, it } from 'vitest';
import { AIComposeError, AIOrchestrator } from '../src/orchestrator.js';
import { MockProvider, MockSceneProvider } from '../src/providers/mock.js';
import type { AIProvider, ComposeInput, RoutingPolicy } from '../src/types.js';

const input: ComposeInput = {
  room: { url: 'https://x/room.jpg' },
  product: { url: 'https://x/product.png' },
  category: 'furniture',
  policy: 'balanced',
};

function chains(...providers: AIProvider[]): Record<RoutingPolicy, AIProvider[]> {
  return { quality: providers, balanced: providers, fast: providers };
}

const noSleep = async (): Promise<void> => {};

describe('AIOrchestrator.compose', () => {
  it('uses the primary provider and records model/cost/latency', async () => {
    const primary = new MockProvider({ name: 'primary', model: 'nano-banana-pro', costCents: 5 });
    const orch = new AIOrchestrator({ chains: chains(primary), sleep: noSleep });

    const result = await orch.compose(input);
    expect(result.model).toBe('nano-banana-pro');
    expect(result.costCents).toBe(5);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(primary.callCount).toBe(1);
  });

  it('retries the primary, then falls back to the next provider', async () => {
    const primary = new MockProvider({ name: 'primary', alwaysFail: true });
    const fallback = new MockProvider({ name: 'fallback', model: 'flux2-edit' });
    const orch = new AIOrchestrator({
      chains: chains(primary, fallback),
      retries: 2,
      sleep: noSleep,
    });

    const result = await orch.compose(input);
    expect(result.model).toBe('flux2-edit');
    expect(primary.callCount).toBe(2); // retried before fallback
    expect(fallback.callCount).toBe(1);
  });

  it('recovers if the primary succeeds on its second attempt (no fallback)', async () => {
    const primary = new MockProvider({ name: 'primary', failTimes: 1, model: 'nano-banana-pro' });
    const fallback = new MockProvider({ name: 'fallback' });
    const orch = new AIOrchestrator({ chains: chains(primary, fallback), retries: 2, sleep: noSleep });

    const result = await orch.compose(input);
    expect(result.model).toBe('nano-banana-pro');
    expect(primary.callCount).toBe(2);
    expect(fallback.callCount).toBe(0);
  });

  it('throws AIComposeError with attempts when all providers fail', async () => {
    const primary = new MockProvider({ name: 'primary', alwaysFail: true });
    const fallback = new MockProvider({ name: 'fallback', alwaysFail: true });
    const orch = new AIOrchestrator({ chains: chains(primary, fallback), retries: 2, sleep: noSleep });

    await expect(orch.compose(input)).rejects.toBeInstanceOf(AIComposeError);
    try {
      await orch.compose(input);
    } catch (err) {
      expect((err as AIComposeError).attempts).toHaveLength(4); // 2 providers × 2 retries
    }
  });

  it('throws when the policy has no providers', async () => {
    const orch = new AIOrchestrator({ chains: { quality: [], balanced: [], fast: [] }, sleep: noSleep });
    await expect(orch.compose(input)).rejects.toBeInstanceOf(AIComposeError);
  });
});

describe('optional steps', () => {
  it('analyzeScene returns null without a provider, a value with one', async () => {
    const primary = new MockProvider({ name: 'primary' });
    expect(await new AIOrchestrator({ chains: chains(primary) }).analyzeScene(input.room)).toBeNull();

    const withScene = new AIOrchestrator({ chains: chains(primary), scene: new MockSceneProvider() });
    const scene = await withScene.analyzeScene(input.room);
    expect(scene?.isExterior).toBe(false);
    expect(scene?.lighting.direction).toBe('top-left');
  });
});

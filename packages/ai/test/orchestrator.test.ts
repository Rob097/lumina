import { describe, expect, it } from 'vitest';
import { AIComposeError, AIOrchestrator } from '../src/orchestrator.js';
import { MockProvider, MockPlannerProvider } from '../src/providers/mock.js';
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

describe('AIOrchestrator.compose — region routing (draw-to-place)', () => {
  const region = { box: { x: 0.6, y: 0.2, w: 0.3, h: 0.6 }, placement: 'in the right part of the scene' };

  it('routes a region edit to the regionChain, not the policy chain', async () => {
    const policy = new MockProvider({ name: 'policy', model: 'gemini' });
    const fal = new MockProvider({ name: 'region', model: 'seedream' });
    const orch = new AIOrchestrator({ chains: chains(policy), regionChain: [fal], sleep: noSleep });

    const result = await orch.compose({ ...input, region });
    expect(result.model).toBe('seedream');
    expect(fal.callCount).toBe(1);
    expect(policy.callCount).toBe(0);
  });

  it('uses the policy chain when there is no region', async () => {
    const policy = new MockProvider({ name: 'policy', model: 'gemini' });
    const fal = new MockProvider({ name: 'region', model: 'seedream' });
    const orch = new AIOrchestrator({ chains: chains(policy), regionChain: [fal], sleep: noSleep });

    const result = await orch.compose(input);
    expect(result.model).toBe('gemini');
    expect(policy.callCount).toBe(1);
    expect(fal.callCount).toBe(0);
  });

  it('falls back to the policy chain when no regionChain is configured', async () => {
    const policy = new MockProvider({ name: 'policy', model: 'gemini' });
    const orch = new AIOrchestrator({ chains: chains(policy), sleep: noSleep });

    const result = await orch.compose({ ...input, region });
    expect(result.model).toBe('gemini');
    expect(policy.callCount).toBe(1);
  });
});

describe('optional steps', () => {
  it('plan returns null without a provider, a neutral plan with one', async () => {
    const primary = new MockProvider({ name: 'primary' });
    const plannerInput = { room: input.room, product: input.product, category: 'furniture' as const };
    expect(await new AIOrchestrator({ chains: chains(primary) }).plan(plannerInput)).toBeNull();

    const withPlanner = new AIOrchestrator({ chains: chains(primary), planner: new MockPlannerProvider() });
    const plan = await withPlanner.plan(plannerInput);
    expect(plan?.mode).toBe('object_placement');
    expect(plan?.confidence).toBe(0);
  });
});

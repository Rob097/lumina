import { describe, expect, it } from 'vitest';
import { AIComposeError, AIOrchestrator, AITimeoutError } from '../src/orchestrator.js';
import { MockProvider, MockPlannerProvider } from '../src/providers/mock.js';
import type { AIProvider, ComposeInput, ProviderResult, RoutingPolicy } from '../src/types.js';

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

/** A provider whose compose never resolves — simulates a hung gateway/model call. Records the signal so a
 *  test can assert the orchestrator aborted it. */
class HangingProvider implements AIProvider {
  callCount = 0;
  lastSignal?: AbortSignal;
  constructor(readonly name = 'hang') {}
  compose(_input: ComposeInput, _prompt: string, signal?: AbortSignal): Promise<ProviderResult> {
    this.callCount += 1;
    this.lastSignal = signal;
    return new Promise<ProviderResult>(() => {
      /* never resolves */
    });
  }
}

describe('AIOrchestrator.compose — per-call timeouts (root-cause fix for FUNCTION_INVOCATION_TIMEOUT)', () => {
  it('aborts a hung provider at the attempt timeout and falls back to the next provider', async () => {
    const hang = new HangingProvider();
    const fallback = new MockProvider({ name: 'fallback', model: 'flux2-edit' });
    const orch = new AIOrchestrator({
      chains: chains(hang, fallback),
      retries: 1,
      composeAttemptTimeoutMs: 20,
      composeTotalTimeoutMs: 500,
      sleep: noSleep,
    });

    const result = await orch.compose(input);
    expect(result.model).toBe('flux2-edit'); // recovered via fallback instead of hanging forever
    expect(hang.callCount).toBe(1);
    expect(hang.lastSignal?.aborted).toBe(true); // the hung call was actually cancelled
    expect(fallback.callCount).toBe(1);
  });

  it('throws AIComposeError (bounded, never hangs the caller) when every provider hangs', async () => {
    const orch = new AIOrchestrator({
      chains: chains(new HangingProvider('h1'), new HangingProvider('h2')),
      retries: 1,
      composeAttemptTimeoutMs: 20,
      composeTotalTimeoutMs: 500,
      sleep: noSleep,
    });
    await expect(orch.compose(input)).rejects.toBeInstanceOf(AIComposeError);
  });

  it('stops retrying once the overall deadline is exceeded (caps attempts below `retries`)', async () => {
    const hang = new HangingProvider();
    const orch = new AIOrchestrator({
      chains: chains(hang),
      retries: 20,
      composeAttemptTimeoutMs: 25,
      composeTotalTimeoutMs: 60,
      sleep: noSleep,
    });
    await expect(orch.compose(input)).rejects.toBeInstanceOf(AIComposeError);
    // The deadline (60ms) cuts the run far short of the 20 configured retries.
    expect(hang.callCount).toBeLessThan(5);
    expect(hang.callCount).toBeGreaterThanOrEqual(1);
  });

  it('does not abort a provider that answers within the timeout (signal stays live)', async () => {
    let seen: AbortSignal | undefined;
    const fast: AIProvider = {
      name: 'fast',
      async compose(_i, _p, signal): Promise<ProviderResult> {
        seen = signal;
        return { bytes: new Uint8Array([1]), contentType: 'image/png', model: 'ok', costCents: 1 };
      },
    };
    const orch = new AIOrchestrator({
      chains: chains(fast),
      composeAttemptTimeoutMs: 1000,
      composeTotalTimeoutMs: 2000,
      sleep: noSleep,
    });
    const result = await orch.compose(input);
    expect(result.model).toBe('ok');
    expect(seen?.aborted).toBe(false);
  });

  it('is unchanged when no timeout is configured (existing behaviour preserved)', async () => {
    const primary = new MockProvider({ name: 'primary', model: 'nano-banana-pro' });
    const orch = new AIOrchestrator({ chains: chains(primary), sleep: noSleep });
    const result = await orch.compose(input);
    expect(result.model).toBe('nano-banana-pro');
  });
});

describe('AIOrchestrator best-effort steps — timeouts', () => {
  it('surfaces a planner timeout as AITimeoutError (caller degrades to a neutral plan)', async () => {
    const planner = {
      plan: () =>
        new Promise<never>(() => {
          /* hang */
        }),
    };
    const orch = new AIOrchestrator({
      chains: chains(new MockProvider({ name: 'p' })),
      planner,
      plannerTimeoutMs: 20,
      sleep: noSleep,
    });
    await expect(
      orch.plan({ room: input.room, product: input.product, category: 'tiles' }),
    ).rejects.toBeInstanceOf(AITimeoutError);
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

import { AIOrchestrator } from './orchestrator.js';
import { FalProvider } from './providers/fal.js';
import { MockProvider } from './providers/mock.js';
import type { AIProvider, RoutingPolicy } from './types.js';

/**
 * Build an orchestrator from env. Falls back to a deterministic mock provider when `FAL_KEY` is unset
 * or `AI_PROVIDER=mock` (used by local dev + the e2e script). Models, costs, and resolutions are all
 * env-configured (D19).
 */
export function createOrchestratorFromEnv(env: Record<string, string | undefined>): AIOrchestrator {
  const key = env.FAL_KEY;
  if (!key || env.AI_PROVIDER === 'mock') {
    const mock = new MockProvider({ name: 'mock', model: 'mock-compose', costCents: 0 });
    return new AIOrchestrator({ chains: { quality: [mock], balanced: [mock], fast: [mock] } });
  }

  const quality = new FalProvider({
    name: 'fal-quality',
    model: env.FAL_MODEL_QUALITY ?? 'fal-ai/nano-banana-pro/edit',
    key,
    costCents: Number(env.FAL_COST_QUALITY ?? 13),
  });
  const fast = new FalProvider({
    name: 'fal-fast',
    model: env.FAL_MODEL_FAST ?? 'fal-ai/flux-2/edit',
    key,
    costCents: Number(env.FAL_COST_FAST ?? 6),
  });

  const chains: Record<RoutingPolicy, AIProvider[]> = {
    quality: [quality, fast],
    balanced: [quality, fast],
    fast: [fast, quality],
  };
  return new AIOrchestrator({ chains });
}

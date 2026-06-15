import { AIOrchestrator } from './orchestrator.js';
import { GatewayProvider } from './providers/gateway.js';
import { GatewayQuantityProvider } from './providers/gateway-quantity.js';
import { MockProvider, MockQuantityProvider } from './providers/mock.js';
import type { AIProvider, RoutingPolicy } from './types.js';

/**
 * Build an orchestrator from env. Falls back to a deterministic mock provider when no AI Gateway
 * credentials are present (`AI_GATEWAY_API_KEY` or, on Vercel, `VERCEL_OIDC_TOKEN`) or when
 * `AI_PROVIDER=mock` (used by local dev + the e2e script). Models, costs, and resolutions are all
 * env-configured (D19, D49).
 */
export function createOrchestratorFromEnv(env: Record<string, string | undefined>): AIOrchestrator {
  const apiKey = env.AI_GATEWAY_API_KEY;
  const hasCreds = Boolean(apiKey || env.VERCEL_OIDC_TOKEN);
  if (!hasCreds || env.AI_PROVIDER === 'mock') {
    const mock = new MockProvider({ name: 'mock', model: 'mock-compose', costCents: 0 });
    return new AIOrchestrator({
      chains: { quality: [mock], balanced: [mock], fast: [mock] },
      quantity: new MockQuantityProvider(),
    });
  }

  // Pin a high output resolution (2K) by default; matching the room's aspect ratio is per-request.
  const imageSize = env.GATEWAY_IMAGE_SIZE ?? '2K';
  const quality = new GatewayProvider({
    name: 'gateway-quality',
    model: env.GATEWAY_MODEL_QUALITY ?? 'google/gemini-3-pro-image',
    costCents: Number(env.GATEWAY_COST_QUALITY ?? 13),
    imageSize,
    apiKey,
  });
  const fast = new GatewayProvider({
    name: 'gateway-fast',
    model: env.GATEWAY_MODEL_FAST ?? 'google/gemini-3.1-flash-image-preview',
    costCents: Number(env.GATEWAY_COST_FAST ?? 6),
    imageSize,
    apiKey,
  });

  const chains: Record<RoutingPolicy, AIProvider[]> = {
    quality: [quality, fast],
    balanced: [quality, fast],
    fast: [fast, quality],
  };
  // A cheap text+vision pass for coverage products (tiles/decor/renovation/outdoor); single-unit
  // categories short-circuit to 1 in the orchestrator without ever calling it.
  const quantity = new GatewayQuantityProvider({
    model: env.GATEWAY_MODEL_QUANTITY ?? 'google/gemini-2.5-flash',
    apiKey,
  });
  return new AIOrchestrator({ chains, quantity });
}

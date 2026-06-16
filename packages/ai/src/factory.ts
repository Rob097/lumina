import { AIOrchestrator } from './orchestrator.js';
import { ReplicateMattingProvider } from './providers/bg-removal.js';
import { GatewayProvider } from './providers/gateway.js';
import { GatewayQuantityProvider } from './providers/gateway-quantity.js';
import { GatewaySceneProvider } from './providers/gateway-scene.js';
import {
  MockBgRemovalProvider,
  MockProvider,
  MockQuantityProvider,
  MockSceneProvider,
} from './providers/mock.js';
import type { AIProvider, BgRemovalProvider, RoutingPolicy, SceneProvider } from './types.js';

/**
 * Select the product background-removal provider from env (Phase 1 / D63). Returns `undefined` when it
 * isn't configured (or is configured incompletely) so the workflow simply skips the cutout and composes
 * the raw product image — bg removal is best-effort, never a hard requirement. A matting model preserves
 * the original product pixels; the network call is one-file-swappable behind `BgRemovalProvider`.
 */
export function selectBgRemovalProvider(
  env: Record<string, string | undefined>,
): BgRemovalProvider | undefined {
  const choice = env.BG_REMOVAL_PROVIDER;
  if (choice === 'none') {
    return undefined;
  }
  if (choice === 'mock') {
    return new MockBgRemovalProvider();
  }
  const token = env.REPLICATE_API_TOKEN;
  const model = env.BG_REMOVAL_MODEL;
  // Explicit `replicate`, or the default when a token + model are present.
  if (choice === 'replicate' || (!choice && token && model)) {
    if (!token || !model) {
      return undefined; // requested but incomplete → degrade, don't crash
    }
    return new ReplicateMattingProvider({ model, apiToken: token });
  }
  return undefined;
}

/**
 * Select the scene-analysis provider from env (Phase 2 / D64). Scene analysis is always available — the
 * neutral mock offline, the gateway flash model when creds are present. Best-effort downstream: a
 * low-confidence/failed analysis is dropped, so this never needs an explicit "off" switch. The model
 * defaults to the cheap quantity flash model unless `SCENE_MODEL` overrides it (one-file swap, #8).
 */
export function selectSceneProvider(env: Record<string, string | undefined>): SceneProvider {
  const apiKey = env.AI_GATEWAY_API_KEY;
  const hasCreds = Boolean(apiKey || env.VERCEL_OIDC_TOKEN);
  if (!hasCreds || env.AI_PROVIDER === 'mock') {
    return new MockSceneProvider();
  }
  return new GatewaySceneProvider({
    model: env.SCENE_MODEL ?? env.GATEWAY_MODEL_QUANTITY ?? 'google/gemini-2.5-flash',
    apiKey,
  });
}

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
      bgRemoval: new MockBgRemovalProvider(),
      scene: new MockSceneProvider(),
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
  return new AIOrchestrator({
    chains,
    bgRemoval: selectBgRemovalProvider(env),
    scene: selectSceneProvider(env),
    quantity,
  });
}

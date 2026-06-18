import { AIOrchestrator } from './orchestrator.js';
import { resolveImageSizes } from './routing.js';
import { ReplicateMattingProvider } from './providers/bg-removal.js';
import { GatewayBgRemovalProvider } from './providers/bg-removal-gateway.js';
import { GatewayProvider } from './providers/gateway.js';
import { GatewayQuantityProvider } from './providers/gateway-quantity.js';
import { GatewayPlannerProvider } from './providers/gateway-planner.js';
import {
  MockBgRemovalProvider,
  MockPlannerProvider,
  MockProvider,
  MockQuantityProvider,
} from './providers/mock.js';
import type { AIProvider, BgRemovalProvider, PlannerProvider, RoutingPolicy } from './types.js';

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
  // Vercel-consolidated path: a generative cutout on the AI Gateway (reuses AI_GATEWAY_API_KEY / OIDC — no
  // Replicate). Lower-fidelity than matting (re-renders the product), but it's only a reference. (D63)
  if (choice === 'gateway') {
    const apiKey = env.AI_GATEWAY_API_KEY;
    if (!apiKey && !env.VERCEL_OIDC_TOKEN) {
      return undefined; // no gateway creds → degrade, don't crash
    }
    return new GatewayBgRemovalProvider({
      model: env.BG_REMOVAL_GATEWAY_MODEL ?? env.GATEWAY_MODEL_QUALITY ?? 'google/gemini-3-pro-image',
      apiKey,
    });
  }
  const token = env.REPLICATE_API_TOKEN;
  const model = env.BG_REMOVAL_MODEL;
  // Explicit `replicate`, or the default when a token + model are present.
  if (choice === 'replicate' || (!choice && token && model)) {
    if (!token || !model) {
      return undefined; // requested but incomplete → degrade, don't crash
    }
    return new ReplicateMattingProvider({ model, apiToken: token, inputKey: env.BG_REMOVAL_INPUT_KEY });
  }
  return undefined;
}

/**
 * Select the planner provider from env (Generation Engine v3 §4.1). The planner is always available — the
 * neutral mock offline (a zero-confidence `object_placement` plan = pre-planner behaviour), the gateway
 * flash model when creds are present. Best-effort downstream: a low-confidence/failed plan falls back to a
 * neutral plan, so this never needs an explicit "off" switch. The model defaults to the cheap flash model
 * unless `PLANNER_MODEL` (or the legacy `SCENE_MODEL`) overrides it (one-file swap, #8).
 */
export function selectPlannerProvider(env: Record<string, string | undefined>): PlannerProvider {
  const apiKey = env.AI_GATEWAY_API_KEY;
  const hasCreds = Boolean(apiKey || env.VERCEL_OIDC_TOKEN);
  if (!hasCreds || env.AI_PROVIDER === 'mock') {
    return new MockPlannerProvider();
  }
  return new GatewayPlannerProvider({
    model: env.PLANNER_MODEL ?? env.SCENE_MODEL ?? env.GATEWAY_MODEL_QUANTITY ?? 'google/gemini-2.5-flash',
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
      planner: new MockPlannerProvider(),
      quantity: new MockQuantityProvider(),
    });
  }

  // Per-policy output resolution (Phase 3): 1K on the fast common path, 2K on quality. The aspect ratio is
  // pinned per-request to the room.
  const imageSize = resolveImageSizes(env);
  const quality = new GatewayProvider({
    name: 'gateway-quality',
    model: env.GATEWAY_MODEL_QUALITY ?? 'google/gemini-3-pro-image',
    costCents: Number(env.GATEWAY_COST_QUALITY ?? 13),
    imageSize: imageSize.quality,
    apiKey,
  });
  const fast = new GatewayProvider({
    name: 'gateway-fast',
    model: env.GATEWAY_MODEL_FAST ?? 'google/gemini-3.1-flash-image-preview',
    costCents: Number(env.GATEWAY_COST_FAST ?? 6),
    imageSize: imageSize.fast,
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
    planner: selectPlannerProvider(env),
    quantity,
  });
}

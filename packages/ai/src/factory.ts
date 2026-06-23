import { AIOrchestrator } from './orchestrator.js';
import { resolveImageSizes } from './routing.js';
import { ReplicateMattingProvider } from './providers/bg-removal.js';
import { GatewayBgRemovalProvider } from './providers/bg-removal-gateway.js';
import { GatewayProvider } from './providers/gateway.js';
import { FalProvider } from './providers/fal.js';
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
 * The cross-provider compose fallback (fal.ai Seedream). When `FAL_KEY` is present it's appended to every
 * compose chain so a full AI-Gateway outage still produces a result. It runs the SAME prompt and the SAME
 * pixel-perfect composite as the Gemini primary, so the shopper sees no quality/speed difference vs Gemini
 * (a faithful reference editor at ~$0.04 / ~30s). Absent ⇒ undefined (gemini-only, no crash). Behind
 * `AIProvider.compose()` (HARD RULE #8); the key only ever rides the Authorization header. Model/cost are
 * env-configurable (`FAL_IMAGE_MODEL`, `FAL_COST_CENTS`).
 */
export function selectFalFallback(env: Record<string, string | undefined>): AIProvider | undefined {
  if (!env.FAL_KEY) {
    return undefined;
  }
  return new FalProvider({
    name: 'fal-seedream',
    model: env.FAL_IMAGE_MODEL ?? 'fal-ai/bytedance/seedream/v4.5/edit',
    costCents: Number(env.FAL_COST_CENTS ?? 4),
    falKey: env.FAL_KEY,
  });
}

/**
 * Assemble the per-policy compose chains (primary first, then fallbacks; the orchestrator tries each in
 * order on error). Default (`primary: 'gemini'`): `quality` leads the quality/balanced policies, `fast`
 * leads the fast policy, and the optional cross-provider `fallback` (fal) is appended LAST to every policy
 * as the outage safety net — so a single provider being down never hard-fails a generation. With
 * `primary: 'fal'` (and a `fallback` present) fal leads every policy and the Gemini pair becomes the
 * fallback — same prompt + composite either way, so the shopper sees no quality/speed difference; this is
 * the env-flippable lever (`COMPOSE_PRIMARY`) to promote fal once the golden eval proves it ≥ Gemini.
 */
export function buildComposeChains(
  quality: AIProvider,
  fast: AIProvider,
  fallback?: AIProvider,
  opts?: { primary?: 'gemini' | 'fal' },
): Record<RoutingPolicy, AIProvider[]> {
  if (opts?.primary === 'fal' && fallback) {
    return {
      quality: [fallback, quality, fast],
      balanced: [fallback, quality, fast],
      fast: [fallback, fast, quality],
    };
  }
  const tail = fallback ? [fallback] : [];
  return {
    quality: [quality, fast, ...tail],
    balanced: [quality, fast, ...tail],
    fast: [fast, quality, ...tail],
  };
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

  // Gemini leads (the proven 7/7 quality path); fal is appended as the cross-provider fallback when a
  // FAL_KEY is configured, so a gateway outage still yields a result at equivalent quality/speed.
  // `COMPOSE_PRIMARY=fal` flips fal to lead (Gemini becomes the fallback) — the evidence-gated lever to
  // promote fal once the golden eval proves it ≥ Gemini; default stays the proven Gemini-first order.
  const primary = env.COMPOSE_PRIMARY === 'fal' ? 'fal' : 'gemini';
  const chains = buildComposeChains(quality, fast, selectFalFallback(env), { primary });
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

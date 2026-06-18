import type { GenerationPlan } from '@lumina/shared';
import type { RoutingPolicy } from './types.js';

/** Below this plan confidence the case is treated as hard and escalated to the quality model. */
export const ESCALATE_CONFIDENCE_MIN = 0.4;

/**
 * Resolve the routing policy from the merchant plan + the planner's read (Generation Engine v3, Phase 3).
 * The common path defaults to the **fast** model; it escalates to **quality** when the planner flags a
 * difficult scene (blurry / dark / cluttered, or a low-confidence plan) and for the top plan tiers. The
 * free tier stays fast (watermarked, cost-controlled) even on a hard scene. The orchestrator keeps the
 * fast→quality fallback chain regardless, so an escalation decision is a starting point, not a guarantee.
 */
export function resolvePolicy(merchantPlan: string, plan: GenerationPlan): RoutingPolicy {
  if (merchantPlan === 'free') return 'fast';
  if (merchantPlan === 'scale' || merchantPlan === 'enterprise') return 'quality';
  const q = plan.sceneFacts.quality;
  const difficult = q.blurry || q.dark || q.cluttered || plan.confidence < ESCALATE_CONFIDENCE_MIN;
  return difficult ? 'quality' : 'fast';
}

/**
 * Per-policy output resolution (Phase 3): 1K on the fast common path, 2K on the quality path. Env-tunable
 * (`GATEWAY_IMAGE_SIZE_FAST` / `GATEWAY_IMAGE_SIZE`). Smaller renders on the fast path cut latency for the
 * easy majority; the quality path keeps 2K for the hard cases.
 */
export function resolveImageSizes(env: Record<string, string | undefined>): { fast: string; quality: string } {
  return {
    fast: env.GATEWAY_IMAGE_SIZE_FAST ?? '1K',
    quality: env.GATEWAY_IMAGE_SIZE ?? '2K',
  };
}

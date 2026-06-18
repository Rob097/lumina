import type { GenerationPlan, SceneAnalysis } from '@lumina/shared';

/**
 * Adapt a {@link GenerationPlan} into the {@link SceneAnalysis} the current compositor consumes
 * (Generation Engine v3, Phase 1). The planner replaces the separate scene pass, so its per-image
 * `sceneFacts` + `target` carry the lighting / surfaces / tilt / placement the compose prompt already
 * reads — keeping compose behaviour unchanged while the new mode/repetition fields wait for Phase 2.
 */
export function planToSceneAnalysis(plan: GenerationPlan): SceneAnalysis {
  const { sceneFacts, target, confidence } = plan;
  return {
    isExterior: sceneFacts.isExterior,
    lighting: sceneFacts.lighting,
    surfaces: sceneFacts.surfaces,
    tiltDegrees: sceneFacts.tiltDegrees,
    quality: sceneFacts.quality,
    suggestedPlacement: {
      region: target.description,
      ...(target.bbox ? { bbox: target.bbox } : {}),
    },
    confidence,
  };
}

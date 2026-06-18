import { z } from 'zod';
import { SceneLightingSchema, SceneSurfaceSchema, SceneQualitySchema } from './scene.js';

/**
 * Generation plan — the planner-driven reasoning step (Generation Engine v3, §4.1).
 *
 * A single cheap vision call reasons over **both images + product metadata** and returns the
 * *operation* to perform, NOT a product-category taxonomy. There are only ~3 modes, inferred per image,
 * which keeps it scalable (the opposite of a per-product-type switch). It evolves and replaces the
 * separate scene-analysis pass (`SceneAnalysisSchema`) — `sceneFacts` reuses its sub-schemas — and adds
 * the missing decision: covering vs replacement vs placement, the target surface/element, how many units
 * and how they repeat, and scale. Best-effort: low `confidence` or an error falls back to a neutral
 * `object_placement` plan (today's behaviour) and never fails or bills a generation.
 */

/** The operation to perform — an *operation*, inferred per image, never a product category. */
export const GenerationModeSchema = z.enum([
  /** Clad a surface, repeating the product to cover the area (acoustic panels, tiles, wallpaper, flooring). */
  'surface_covering',
  /** Replace an existing element in the scene (a new wardrobe/shower/door for an existing one). */
  'object_replacement',
  /** Place the product once at the natural or specified location (lamp, sofa, mirror, chandelier). */
  'object_placement',
]);
export type GenerationMode = z.infer<typeof GenerationModeSchema>;

/** How the product repeats over the target (single placement vs how a covering tiles the surface). */
export const RepetitionKindSchema = z.enum(['single', 'grid', 'rows', 'area_fill']);
export type RepetitionKind = z.infer<typeof RepetitionKindSchema>;

export const PlanTargetSchema = z.object({
  /** Free-text target, e.g. 'the left wall', 'the existing wardrobe', 'the floor'. */
  description: z.string(),
  /**
   * Normalised [x0, y0, x1, y1] in 0..1, top-left origin — a plain repeating array, NOT a `z.tuple`:
   * a tuple serialises to JSON-Schema `items: [...]` which Gemini's structured-output `response_schema`
   * proto rejects, silently killing the planner (the same lesson as {@link SuggestedPlacementSchema}).
   */
  bbox: z.array(z.number()).optional(),
});
export type PlanTarget = z.infer<typeof PlanTargetSchema>;

export const PlanRepetitionSchema = z.object({
  kind: RepetitionKindSchema,
  /**
   * Coverage unit count. Clamped into [1, 999] and rounded rather than rejected — a wild number from the
   * model must never fail the whole (best-effort) plan parse.
   */
  estimatedCount: z
    .number()
    .optional()
    .transform((n) => (n == null ? undefined : Math.min(999, Math.max(1, Math.round(n))))),
});
export type PlanRepetition = z.infer<typeof PlanRepetitionSchema>;

export const ProductDimensionsCmSchema = z.object({
  w: z.number().optional(),
  h: z.number().optional(),
  d: z.number().optional(),
});
export type ProductDimensionsCm = z.infer<typeof ProductDimensionsCmSchema>;

export const PlanScaleSchema = z.object({
  /** Known real-world product size, echoed back so the compositor can reason about it. */
  productDimensionsCm: ProductDimensionsCmSchema.optional(),
  /** Free-text scene scale cue, e.g. 'ceiling ~2.7m', 'door for reference'. */
  sceneScaleHint: z.string().optional(),
});
export type PlanScale = z.infer<typeof PlanScaleSchema>;

/** Per-image facts (evolved from {@link SceneAnalysisSchema}; sub-schemas reused, HARD RULE #6). */
export const SceneFactsSchema = z.object({
  isExterior: z.boolean(),
  lighting: SceneLightingSchema,
  surfaces: z.array(SceneSurfaceSchema),
  tiltDegrees: z.number(),
  quality: SceneQualitySchema,
});
export type SceneFacts = z.infer<typeof SceneFactsSchema>;

export const GenerationPlanSchema = z.object({
  mode: GenerationModeSchema,
  target: PlanTargetSchema,
  repetition: PlanRepetitionSchema,
  scale: PlanScaleSchema,
  sceneFacts: SceneFactsSchema,
  notes: z.string().optional(),
  /** 0..1 — a low-confidence plan is dropped by the caller in favour of {@link neutralGenerationPlan}. */
  confidence: z.number().min(0).max(1),
});
export type GenerationPlan = z.infer<typeof GenerationPlanSchema>;

/**
 * The best-effort fallback: a zero-confidence `object_placement` plan with no extra facts — exactly the
 * pre-planner behaviour (place the product once at the most natural location). Used by the offline mock
 * and whenever the planner errors or returns low confidence, so a flaky planner never degrades a generation.
 */
export function neutralGenerationPlan(): GenerationPlan {
  return {
    mode: 'object_placement',
    target: { description: 'the most natural, functional location' },
    repetition: { kind: 'single' },
    scale: {},
    sceneFacts: {
      isExterior: false,
      lighting: { direction: 'unknown', intensity: 'medium' },
      surfaces: [],
      tiltDegrees: 0,
      quality: { blurry: false, dark: false, cluttered: false },
    },
    confidence: 0,
  };
}

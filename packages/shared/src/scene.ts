import { z } from 'zod';

/**
 * Scene analysis — the per-image understanding pass (Generation Engine v2 / Phase 2, D64).
 *
 * A single cheap vision call returns **continuous facts about THIS specific photo** — light direction,
 * surface map, tilt, scale, placement region, quality flags — NOT a discrete category/position taxonomy.
 * It feeds compose (lighting/scale/surfaces/placement), Phase 3 (tilt → deskew) and Phase 4 (quality →
 * model escalation). Best-effort: low `confidence` or an error degrades to the prior compose behaviour.
 */

/** Dominant light direction in the photo (image-relative). */
export const LightDirectionSchema = z.enum([
  'top',
  'top-left',
  'top-right',
  'left',
  'right',
  'front',
  'ambient',
  'unknown',
]);
export type LightDirection = z.infer<typeof LightDirectionSchema>;

export const LightIntensitySchema = z.enum(['low', 'medium', 'high']);
export type LightIntensity = z.infer<typeof LightIntensitySchema>;

/** Coarse kind of a visible surface the product could sit on / against. */
export const SceneSurfaceKindSchema = z.enum([
  'floor',
  'wall',
  'ceiling',
  'table',
  'ground',
  'other',
]);
export type SceneSurfaceKind = z.infer<typeof SceneSurfaceKindSchema>;

export const SceneSurfaceSchema = z.object({
  kind: SceneSurfaceKindSchema,
  /** Free-text note, e.g. 'back wall', 'left-facing' — never an enum, keeps it scalable. */
  orientation: z.string().optional(),
});
export type SceneSurface = z.infer<typeof SceneSurfaceSchema>;

export const SceneLightingSchema = z.object({
  direction: LightDirectionSchema,
  /** Approximate colour temperature in Kelvin (warm ~2700, neutral ~4000, cool ~6500). */
  temperatureK: z.number().optional(),
  intensity: LightIntensitySchema,
});
export type SceneLighting = z.infer<typeof SceneLightingSchema>;

export const RoomScaleSchema = z.object({
  ceilingHeightM: z.number().optional(),
  /** Recognisable objects that give real-world scale, e.g. ['door', 'sofa']. */
  referenceObjects: z.array(z.string()).optional(),
});
export type RoomScale = z.infer<typeof RoomScaleSchema>;

export const SuggestedPlacementSchema = z.object({
  /** Free-text placement region (model-defined, open-ended) — never an enum. */
  region: z.string(),
  /** Normalised [x0, y0, x1, y1] in 0..1, top-left origin. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});
export type SuggestedPlacement = z.infer<typeof SuggestedPlacementSchema>;

export const SceneQualitySchema = z.object({
  blurry: z.boolean(),
  dark: z.boolean(),
  cluttered: z.boolean(),
});
export type SceneQuality = z.infer<typeof SceneQualitySchema>;

export const SceneAnalysisSchema = z.object({
  /** Indoor space vs outdoor scene (facade, entrance, garden) — replaces guessing from the category. */
  isExterior: z.boolean(),
  lighting: SceneLightingSchema,
  surfaces: z.array(SceneSurfaceSchema),
  /** Signed horizon/vertical tilt estimate in degrees (Phase 3 deskews by -tiltDegrees, clamped). */
  tiltDegrees: z.number(),
  roomScale: RoomScaleSchema.optional(),
  suggestedPlacement: SuggestedPlacementSchema.optional(),
  quality: SceneQualitySchema,
  /** 0..1 — low-confidence analyses are dropped by the caller (compose falls back to no scene facts). */
  confidence: z.number().min(0).max(1),
});
export type SceneAnalysis = z.infer<typeof SceneAnalysisSchema>;

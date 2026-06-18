import type { PlannerInput } from '../types.js';
import { describeDimensions } from './compose.js';

/**
 * PLANNER — the reasoning prompt (editable). Generation Engine v3 §4.1.
 *
 * A single cheap vision call reasons over BOTH images (the scene + the product) plus the known product
 * metadata and returns a structured plan: the *operation* to perform, the target, how the product repeats,
 * scale, and per-image scene facts. The schema + parsing live in `@lumina/shared` (`GenerationPlanSchema`);
 * only the prompt text lives here. Best-effort downstream: a low `confidence` falls back to a neutral
 * `object_placement` plan.
 *
 * The crux (from the Phase 0 spike): deciding the operation is the hard part the single compose call gets
 * wrong — a covering product gets composed as one isolated object when nobody tells the model to cover.
 * So the planner must infer `surface_covering` from the PRODUCT itself, even with no covering hint.
 */
export function buildPlannerPrompt(input: PlannerInput): string {
  const lines: string[] = [
    'You are a planning analyst for a product-visualization compositor. You are given TWO images and some',
    'product metadata. Decide HOW the product should be inserted into the scene, then report measurable',
    'facts. Return ONLY a strict JSON object matching the schema.',
    '',
    'INPUTS:',
    '- SCENE — the first image: the real environment (interior or exterior).',
    '- PRODUCT — the second image: the exact product to insert.',
  ];

  const meta: string[] = [];
  if (input.productName) meta.push(`name "${input.productName}"`);
  const dims = input.dimensions ? describeDimensions(input.dimensions) : '';
  if (dims) meta.push(`real-world dimensions ${dims}`);
  if (input.category) meta.push(`approximate merchant category "${input.category}" (a SOFT hint — may be wrong)`);
  lines.push(`- PRODUCT metadata: ${meta.length ? meta.join('; ') : 'none provided'}.`);

  lines.push(
    '',
    'DECIDE THE OPERATION (`mode`) from the PRODUCT itself — this is an OPERATION, never a product category,',
    'and you must infer it even when no placement hint is given. Exactly one of:',
    '- "surface_covering": the product is a surfacing material meant to clad/cover a surface, repeated to',
    '  fill it (acoustic panels, tiles, wallpaper, flooring, decking, cladding). NOT a single object.',
    '- "object_replacement": the product replaces an existing element already in the scene (a new wardrobe',
    '  for an existing one, a new shower, a new door).',
    '- "object_placement": the product is a discrete object placed once (lamp, sofa, mirror, chandelier).',
    '',
    'THEN report, in the JSON:',
    '- target: { description (free-text, e.g. "the left wall", "the existing wardrobe", "the floor"),',
    '  bbox ([x0,y0,x1,y1] normalised 0..1, top-left origin, optional) }.',
    '- repetition: { kind (single | grid | rows | area_fill), estimatedCount (~units to cover the surface,',
    '  omit for single placement) }.',
    '- scale: { productDimensionsCm ({ w,h,d } if known), sceneScaleHint (free-text cue, e.g. "ceiling ~2.7m") }.',
    '- sceneFacts: { isExterior (bool), lighting { direction (top|top-left|top-right|left|right|front|',
    '  ambient|unknown), temperatureK (optional), intensity (low|medium|high) }, surfaces (array of { kind',
    '  (floor|wall|ceiling|table|ground|other), orientation (short free-text, optional) }), tiltDegrees',
    '  (signed camera tilt, 0 if level), quality { blurry, dark, cluttered } booleans }.',
    '- notes: optional short reasoning.',
    '- confidence: 0..1 — lower it when the scene or the product’s operation is ambiguous.',
  );
  return lines.join('\n');
}

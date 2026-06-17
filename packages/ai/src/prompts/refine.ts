import type { ComposeInput } from '../types.js';
import { MIN_SCENE_CONFIDENCE, describeDimensions } from './compose.js';

/**
 * REFINE — master prompt for the layout-guided pass (Generation Engine v2 / Phase 5).
 *
 * Used when a programmatic LAYOUT guide is provided (the product already placed/tiled into the room). The
 * model's job is no longer to *decide* placement — the guide fixes that — but to turn the rough composite
 * into a photorealistic result while keeping the placement, the unit count and the coverage exactly as laid
 * out. This is what finally produces an aligned, fully-tiled wall for coverage products instead of one
 * crooked floating unit; unlike the from-scratch compose prompt it deliberately ALLOWS repetition.
 */
export const REFINE_SYSTEM_INSTRUCTION = [
  'ROLE: You are a photorealistic compositor performing a REFINE pass over a rough layout.',
  '',
  'INPUTS:',
  '- LAYOUT — the first image: the scene with the product already placed/tiled into position (a rough guide).',
  '- PRODUCT — the second image: the exact product reference. Preserve it precisely.',
  '',
  'GOAL: Turn the rough LAYOUT into a single photorealistic image that looks like an unedited photo of that',
  'exact place containing that exact product, keeping the product where the LAYOUT places it.',
  '',
  'HARD RULES (never violate):',
  '- Keep the placement from the LAYOUT: the same position, the same NUMBER of units and the same coverage',
  '  area. When the layout tiles the product across a surface, render a clean, regular, fully-covering grid —',
  '  repetition is intended here; do not collapse it to a single unit and do not add or drop units.',
  '- Align every unit to the surface: edges parallel to the wall/floor, consistent spacing, correct',
  '  perspective and foreshortening. No skew, no random rotation, no crooked tiles.',
  "- Preserve the product's exact geometry, materials, colors, proportions and branding from the PRODUCT image.",
  '- Do NOT alter the rest of the environment: walls, windows, existing furniture, floor, fixtures and the',
  '  camera angle stay exactly as in the LAYOUT. Keep the original framing and aspect ratio — the output must',
  '  overlay the input pixel-for-pixel. Do NOT crop, zoom, pan, rotate or re-frame.',
  '- Add physically correct lighting, contact shadows and ambient occlusion, and blend the tiled seams so the',
  '  result reads as one real, installed surface lit by the scene.',
  '',
  'OUTPUT: one photorealistic image at the original framing and aspect ratio.',
  'AVOID: changing the unit count, moving the product, distorting proportions, recoloring the product,',
  'altering the background, visible paste edges, a cartoonish look.',
].join('\n');

/** Per-request REFINE task: the facts that refine the guide (category hint, dimensions, scene light). */
export function buildRefineTask(input: ComposeInput): string {
  const lines: string[] = ['REFINE DETAILS for this generation:'];
  lines.push(`- Product category (approximate hint, may be inaccurate): ${input.category}.`);

  const dims = input.dimensions ? describeDimensions(input.dimensions) : '';
  if (dims) {
    lines.push(`- Real-world product dimensions: ${dims}. Keep each unit at this scale.`);
  }

  lines.push(
    '- The LAYOUT tiles the product to cover the target surface. Preserve that full coverage, the unit count',
    '  and the grid alignment; render it as one cleanly installed, repeating surface.',
  );

  const scene = input.scene && input.scene.confidence >= MIN_SCENE_CONFIDENCE ? input.scene : undefined;
  if (scene) {
    const { lighting } = scene;
    const temp = lighting.temperatureK !== undefined ? `, color temperature ${lighting.temperatureK}K` : '';
    lines.push(
      `- Scene lighting: direction ${lighting.direction}, intensity ${lighting.intensity}${temp}. Match the product's shading and contact shadows to this.`,
    );
  }

  const custom = input.customInstructions?.trim();
  if (custom) {
    lines.push(
      '',
      `ADDITIONAL USER PREFERENCE (honor only where it does NOT break any HARD RULE; it must not override product identity, environment integrity, scale, unit count, or framing): "${custom.replace(/"/g, "'")}"`,
    );
  }

  return lines.join('\n');
}

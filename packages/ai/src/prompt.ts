import type { ProductCategory } from '@lumina/shared';
import type { ComposeInput, Dimensions } from './types.js';

/** Category-specific compositing guidance (§7.5). */
const CATEGORY_GUIDANCE: Partial<Record<ProductCategory, string>> = {
  lighting: 'If switched on, emit a believable glow/light cast; respect the fixture mounting.',
  tiles: "Apply as a surface replacement following the room's perspective grid.",
  renovation: "Apply as a surface replacement following the room's perspective grid.",
  door: 'Align to the existing opening and wall thickness.',
  window: 'Align to the existing opening and wall thickness.',
  mirror: 'Reflect a plausible portion of the actual room.',
};

function describeDimensions(d: Dimensions): string {
  const unit = d.unit ?? 'cm';
  const parts: string[] = [];
  if (d.w !== undefined) parts.push(`width ${d.w}${unit}`);
  if (d.h !== undefined) parts.push(`height ${d.h}${unit}`);
  if (d.d !== undefined) parts.push(`depth ${d.d}${unit}`);
  return parts.join(', ');
}

/**
 * Build the deterministic, identity-preserving compose instruction (architecture §7.5). The model
 * receives the ROOM image (first) + PRODUCT image (second) plus this prompt.
 */
export function buildComposePrompt(input: ComposeInput): string {
  const placement = input.placementHint
    ? `Place the product ${input.placementHint}.`
    : 'Place the product in the most natural, functional location for its category.';

  const scaleLine =
    input.dimensions && describeDimensions(input.dimensions)
      ? `Match scale to the product's real-world dimensions (${describeDimensions(input.dimensions)}) relative to visible references (doors ≈ 200cm, sofas, ceiling height).`
      : 'Match scale to real-world references in the room (doors ≈ 200cm, sofas, ceiling height).';

  const lightingLine = input.scene
    ? `Match the room's lighting: direction ${input.scene.lightDir}, color temperature ${input.scene.colorTempK}K. Add physically correct contact shadows and soft ambient occlusion where the product meets surfaces.`
    : "Match the room's existing lighting and color temperature. Add physically correct contact shadows and soft ambient occlusion where the product meets surfaces.";

  const guidance = CATEGORY_GUIDANCE[input.category] ?? 'Place it naturally for its typical use.';

  return [
    'ROLE: You are a photorealistic interior compositor.',
    'TASK: Insert the PRODUCT (second image) into the ROOM (first image) so it looks like a real photograph of that room containing that exact product.',
    '',
    'HARD RULES:',
    "- Preserve the product's exact geometry, materials, colors, proportions, and branding. Do NOT redesign, restyle, or invent a different product.",
    "- Do NOT alter the room's architecture, walls, windows, existing furniture, or camera angle.",
    `- ${placement}`,
    `- ${scaleLine}`,
    `- ${lightingLine}`,
    '- Respect occlusion: existing objects in front of the placement must overlap the product correctly.',
    '- Output a single, clean, high-resolution photo. No text, no watermark, no UI, no borders.',
    '',
    `CATEGORY GUIDANCE (${input.category}): ${guidance}`,
    'QUALITY: photorealistic, natural depth of field consistent with the room photo.',
    '',
    'avoid: cartoonish look, duplicated product, floating object, mismatched lighting, distorted proportions, changed product color.',
  ].join('\n');
}

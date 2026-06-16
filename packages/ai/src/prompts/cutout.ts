/**
 * CUTOUT — the product background-removal prompt (editable).
 *
 * Used by the Gateway bg-removal provider (Phase 1 / D63): a generative image model isolates the product
 * onto a clean, plain background so the compositor gets a tidy reference. It is NOT a matting model — the
 * pixels are re-rendered — so the prompt's whole job is to keep the product's identity byte-for-intent
 * intact (shape, proportions, colors, materials, text, branding) while stripping everything else.
 */
export function buildCutoutPrompt(): string {
  return [
    'Isolate ONLY the product shown in the image and place it, completely unchanged, centered on a plain',
    'solid pure-white background. Remove the original background, surfaces, props, hands and any other',
    'objects entirely.',
    'Preserve the product EXACTLY: same shape, proportions, perspective, colors, materials, textures, and',
    'all visible text, logos and branding. Do not redesign, restyle, beautify, add or remove any part of',
    'the product.',
    'No drop shadow, no reflection, no gradient, no added scenery. Output a single clean product cutout',
    'photo on white.',
  ].join(' ');
}

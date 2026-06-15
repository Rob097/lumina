import type { ProductCategory } from '@lumina/shared';

/**
 * Per-category compositing guidance (editable). One short line per category, appended to the compose
 * task. Categories without an entry fall back to `DEFAULT_CATEGORY_GUIDANCE`.
 */
export const CATEGORY_GUIDANCE: Partial<Record<ProductCategory, string>> = {
  lighting: 'If switched on, emit a believable glow/light cast; respect the fixture mounting.',
  tiles: "Apply as a surface replacement following the environment's perspective grid.",
  renovation: "Apply as a surface replacement following the environment's perspective grid.",
  door: 'Align to the existing opening and wall thickness.',
  window: 'Align to the existing opening and wall thickness.',
  mirror: 'Reflect a plausible portion of the actual environment.',
  outdoor: 'Seat the product on the real ground plane; respect outdoor sun direction and soft sky light.',
};

export const DEFAULT_CATEGORY_GUIDANCE = 'Place it naturally for its typical use.';

/**
 * Extra guidance appended only for EXTERIOR scenes (facades, entrances, gardens, yards). Keeps the
 * model honest about outdoor lighting + surfaces that don't exist indoors.
 */
export const EXTERIOR_GUIDANCE =
  'This is an EXTERIOR scene (facade, entrance, garden or yard): seat the product on the real ground plane, respect the building geometry, the sky and the sun direction, and keep vegetation and outdoor surfaces unchanged.';

export function categoryGuidance(category: ProductCategory): string {
  return CATEGORY_GUIDANCE[category] ?? DEFAULT_CATEGORY_GUIDANCE;
}

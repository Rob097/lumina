import { z } from 'zod';
import type { ProductCategory } from '@lumina/shared';
import type { QuantityEstimate } from './types.js';

// The coverage-estimate prompt text lives with the other editable prompts (`./prompts/quantity.ts`);
// re-exported here so existing imports (`buildQuantityPrompt` from '@lumina/ai') keep working.
export { buildQuantityPrompt } from './prompts/quantity.js';

/**
 * Coverage quantity (§7, #7). Some products are bought to *cover a surface* (tiles on a floor, acoustic
 * panels on a wall, decking outdoors) — for those it's worth estimating how many units a room needs.
 * Everything else is a single unit (a sofa, a shower, a wardrobe = 1), so we skip the model call.
 */
export const COVERAGE_CATEGORIES: ReadonlySet<ProductCategory> = new Set<ProductCategory>([
  'tiles',
  'decor',
  'renovation',
  'outdoor',
]);

/** Hard ceiling so a hallucinated estimate can never produce an absurd cart quantity. */
export const MAX_SUGGESTED_QUANTITY = 999;

export function isCoverageCategory(category: ProductCategory): boolean {
  return COVERAGE_CATEGORIES.has(category);
}

/** The trivial estimate for single-unit products: quantity 1, no model call. */
export function singleUnitEstimate(): QuantityEstimate {
  return {
    suggestedQuantity: 1,
    unit: 'unit',
    isCoverage: false,
    rationale: 'Sold as a single unit.',
    confidence: 1,
  };
}

/** Clamp + round a raw model number into a sane integer quantity. */
export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.round(value), 1), MAX_SUGGESTED_QUANTITY);
}

/** Structured JSON the vision model must return (the provider adds `isCoverage`). */
export const QuantityModelOutputSchema = z.object({
  suggestedQuantity: z.number(),
  unit: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type QuantityModelOutput = z.infer<typeof QuantityModelOutputSchema>;

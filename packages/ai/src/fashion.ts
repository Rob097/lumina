import type { ProductCategory } from '@lumina/shared';

/**
 * The fashion / person path (e.g. a handbag composited onto a shopper's selfie). This single predicate is
 * the ONLY switch that isolates the wearable-on-a-person behaviour from the furniture/environment path:
 * every fashion branch keys on it, and each has an `else` that is the unchanged environment behaviour — so a
 * non-fashion generation runs byte-identically to before. Centralised (not scattered `=== 'fashion'`) so
 * extending it to future wearable categories is a one-line change and the whole surface is auditable.
 */
export function isFashionCategory(category: ProductCategory): boolean {
  return category === 'fashion';
}

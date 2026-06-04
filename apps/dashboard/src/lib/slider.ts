/** Before/after wipe-slider math (pure + tested). Used by the generations detail view. */

export function clampSliderPct(pct: number): number {
  return Math.max(0, Math.min(100, pct));
}

/** Percentage (0–100) of a pointer's x position within an element rect. */
export function pctFromPointer(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return clampSliderPct(((clientX - rect.left) / rect.width) * 100);
}

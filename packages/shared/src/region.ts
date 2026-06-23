import type { Annotation } from './annotation.js';

/**
 * Draw-to-place region geometry (draw-on-room / F3). The shopper draws freehand strokes on their room
 * photo; we derive a single normalized region box from those strokes to (a) steer WHERE the product goes
 * and (b) contain the edit. Pure + generic — no per-product / per-scene logic. One definition, shared by
 * the API workflow and the AI prompt (CLAUDE.md HARD RULE #6).
 */

/** A normalized rectangle in [0,1] image coordinates (origin top-left). */
export interface DrawnRegionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);
/** Minimum region edge so a tiny scribble still gives the model room to work. */
const MIN_SIZE = 0.04;
/** Padding as a fraction of the bbox size — breathing room for the product silhouette/contact shadow. */
const PAD = 0.06;

/**
 * Bounding box (normalized) of every annotation stroke point, clamped to the image, grown to a minimum
 * size, and padded by a small fraction of its own size.
 */
export function regionFromStrokes(annotation: Annotation): DrawnRegionBox {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const stroke of annotation.strokes) {
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX > maxX || minY > maxY) {
    // Defensive: the schema requires ≥1 point, but never crash on an empty region.
    return { x: 0, y: 0, w: 1, h: 1 };
  }
  const rawW = Math.max(maxX - minX, MIN_SIZE);
  const rawH = Math.max(maxY - minY, MIN_SIZE);
  const padX = rawW * PAD;
  const padY = rawH * PAD;
  const x = clamp01(minX - padX);
  const y = clamp01(minY - padY);
  return {
    x,
    y,
    w: Math.min(1 - x, rawW + 2 * padX),
    h: Math.min(1 - y, rawH + 2 * padY),
  };
}

/**
 * Map a region box to a generic, human-readable placement phrase from its geometry alone (no per-product
 * branching). Rendered verbatim into the region_edit prompt so the model places the product where drawn.
 */
export function placementPhrase(box: DrawnRegionBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const horizontal = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : '';
  const vertical = cy < 0.34 ? 'upper' : cy > 0.66 ? 'lower' : '';
  const where = [vertical, horizontal].filter(Boolean).join('-') || 'central';
  const area = box.w * box.h;
  return area >= 0.5
    ? `across most of the ${where} part of the scene`
    : `in the ${where} part of the scene`;
}

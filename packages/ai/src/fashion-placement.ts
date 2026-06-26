import type { FashionPlacement } from '@lumina/shared';
import type { Dimensions } from './types.js';

/** Average adult shoulder width in cm — the body-scale reference the detector reports (`shoulderWidthNorm`). */
export const SHOULDER_WIDTH_CM = 40;

/** A pixel box to composite the product into. */
export interface PlacementBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Convert a real-world length to cm (handles the cm/in unit). */
function toCm(value: number, unit: Dimensions['unit']): number {
  return unit === 'in' ? value * 2.54 : value;
}

/**
 * Compute the exact pixel box to composite the product into, from the detected placement + the product's REAL
 * dimensions. Pure + deterministic — this is what gives us exact control of size and position (the generative
 * model ignores both). Size comes from `dimensions` scaled by the shoulder-width reference (px-per-cm); the
 * product hangs from the anchor (anchor = top-centre of the box). The box is clamped to the image.
 *
 * `cutoutAspect` (width/height of the product cutout) preserves the product's real shape when only one real
 * dimension is trustworthy. When no dimensions are given, falls back to a fraction of the shoulder width so the
 * item is still a sane, body-relative size rather than frame-filling.
 */
export function computeProductBox(
  placement: Pick<FashionPlacement, 'anchor' | 'shoulderWidthNorm'>,
  dimensions: Dimensions | undefined,
  imageW: number,
  imageH: number,
  cutoutAspect?: number,
): PlacementBox {
  const shoulderPx = placement.shoulderWidthNorm * imageW;
  const pxPerCm = shoulderPx / SHOULDER_WIDTH_CM;
  const aspect = cutoutAspect && cutoutAspect > 0 ? cutoutAspect : undefined; // width / height

  const realW = dimensions?.w !== undefined ? toCm(dimensions.w, dimensions.unit) : undefined;
  const realH = dimensions?.h !== undefined ? toCm(dimensions.h, dimensions.unit) : undefined;

  // Size from the REAL dimensions where available; fill any missing side from the cutout's aspect; with no
  // dimensions at all, fall back to ~1/3 of the shoulder width so the item stays body-relative, not frame-filling.
  let width: number;
  let height: number;
  if (realW !== undefined && realH !== undefined) {
    width = realW * pxPerCm;
    height = realH * pxPerCm;
  } else if (realW !== undefined) {
    width = realW * pxPerCm;
    height = aspect ? width / aspect : width;
  } else if (realH !== undefined) {
    height = realH * pxPerCm;
    width = aspect ? height * aspect : height;
  } else {
    width = shoulderPx / 3;
    height = aspect ? width / aspect : width;
  }

  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));

  const anchorX = placement.anchor.x * imageW;
  const anchorY = placement.anchor.y * imageH;

  let left = Math.round(anchorX - width / 2); // hang from the anchor (top-centre)
  let top = Math.round(anchorY);

  left = Math.max(0, Math.min(left, Math.max(0, imageW - 1)));
  top = Math.max(0, Math.min(top, Math.max(0, imageH - 1)));
  width = Math.min(width, imageW - left);
  height = Math.min(height, imageH - top);

  return { left, top, width, height };
}

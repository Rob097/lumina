import type { DrawnRegionBox } from '@lumina/shared';
import { loadSharp } from './sharp.js';
import { boxToPixels, rasterizeMask } from './mask.js';
import { compositeOverOriginal } from './composite.js';

/**
 * Draw-to-place safety-net (Option A). The region edit uses the model's full-frame output as-is when it
 * leaves the rest of the room essentially untouched (best quality); only when the model drifts the room too
 * much do we CONTAIN the edit inside the drawn region. These two helpers are the measurement and the
 * containment. They build on the existing change/mask/composite primitives — no thin-object diff-masking
 * (that dropped lamp arms etc.); containment keeps the model's whole region, not a per-pixel diff.
 */

/** Per-pixel color-distance above which a pixel counts as changed (mirrors diff-mask's default intent). */
const DEFAULT_DRIFT_THRESHOLD = 22;

/**
 * Fraction (0..1) of pixels OUTSIDE the drawn region that the edited image changed beyond `threshold`.
 * High ⇒ the model re-rendered the room (bed/walls/furniture) → contain; low ⇒ the room is intact → ship raw.
 */
export async function driftOutsideRegion(
  original: Uint8Array,
  edited: Uint8Array,
  box: DrawnRegionBox,
  opts: { threshold?: number } = {},
): Promise<number> {
  const threshold = opts.threshold ?? DEFAULT_DRIFT_THRESHOLD;
  try {
    const sharp = await loadSharp();
    const meta = await sharp(Buffer.from(original)).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      return 0;
    }
    const toRgb = (b: Uint8Array): Promise<Buffer> =>
      sharp(Buffer.from(b)).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const [o, e] = await Promise.all([toRgb(original), toRgb(edited)]);
    const px = boxToPixels(box, width, height);
    let outsideTotal = 0;
    let outsideChanged = 0;
    for (let y = 0, p = 0; y < height; y += 1) {
      const insideRow = y >= px.top && y < px.top + px.h;
      for (let x = 0; x < width; x += 1, p += 3) {
        if (insideRow && x >= px.left && x < px.left + px.w) {
          continue;
        }
        outsideTotal += 1;
        const d = Math.max(
          Math.abs(o[p]! - e[p]!),
          Math.abs(o[p + 1]! - e[p + 1]!),
          Math.abs(o[p + 2]! - e[p + 2]!),
        );
        if (d > threshold) {
          outsideChanged += 1;
        }
      }
    }
    return outsideTotal > 0 ? outsideChanged / outsideTotal : 0;
  } catch {
    return 0; // best-effort: a measurement failure must never fail the generation
  }
}

/** Grow a normalized box by a fraction of its own size, clamped to the image. */
function dilateBox(b: DrawnRegionBox, f: number): DrawnRegionBox {
  const x = Math.max(0, b.x - b.w * f);
  const y = Math.max(0, b.y - b.h * f);
  return { x, y, w: Math.min(1 - x, b.w * (1 + 2 * f)), h: Math.min(1 - y, b.h * (1 + 2 * f)) };
}

/**
 * Containment composite: keep the model's edited pixels INSIDE the (slightly dilated, feathered) drawn
 * region and restore the byte-identical original everywhere else. Used only when {@link driftOutsideRegion}
 * is high. The dilation gives the product's contact shadow room; the feather hides the seam.
 */
export async function containInRegion(opts: {
  original: Uint8Array;
  edited: Uint8Array;
  box: DrawnRegionBox;
  feather?: number;
  contentType?: string;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const sharp = await loadSharp();
  const meta = await sharp(Buffer.from(opts.original)).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const feather = opts.feather ?? Math.max(1, Math.round(Math.max(width, height) * 0.015));
  const mask = await rasterizeMask({ width, height, box: dilateBox(opts.box, 0.06), feather });
  return compositeOverOriginal({
    original: opts.original,
    edited: opts.edited,
    mask,
    contentType: opts.contentType,
  });
}

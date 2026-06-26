import { loadSharp } from './sharp.js';

/** A product dimension (cm/in) — matches the stored `ProductSnapshot.dimensions` shape. */
type Dims = { w?: number; h?: number; d?: number; unit?: 'cm' | 'in' } | null | undefined;

// The real-world product width (cm) treated as "fills the frame" (no padding). HIGHER => more padding => the
// model renders the product SMALLER. 120 by default: a bag hanging from the elbow renders bigger than one in
// the hand, so the earlier 55 left it oversized. Tunable per case via FASHION_PADDING_REF_CM.
const REF_CM = Number(process.env.FASHION_PADDING_REF_CM ?? 120);
const MIN_FRACTION = 0.12; // never shrink below this share of the canvas
const MAX_FRACTION = 0.85; // at/above this the product is large enough that padding is pointless

function realWidthCm(dims: Dims): number | undefined {
  if (!dims) return undefined;
  const w = dims.w ?? dims.h;
  if (w === undefined) return undefined;
  return dims.unit === 'in' ? w * 2.54 : w;
}

/**
 * The fraction of the canvas the product should occupy, derived from its REAL width (small product → small
 * fraction → the model renders it smaller). Returns null when there are no dimensions or the product is
 * already large enough that padding wouldn't help.
 */
export function paddingFraction(dims: Dims): number | null {
  const wCm = realWidthCm(dims);
  if (wCm === undefined) return null;
  const fraction = wCm / REF_CM;
  if (fraction >= MAX_FRACTION) return null;
  return Math.max(MIN_FRACTION, fraction);
}

/**
 * Shrink a fashion product image by PADDING it: place the (trimmed) product onto a larger TRANSPARENT canvas so
 * it occupies only `fraction` of the frame. Reference-based image editors scale an inserted object roughly by
 * its prominence in the product reference — a frame-filling cutout renders huge, a small padded one renders
 * smaller. Deterministic + dimension-driven (the model ignores size text). Returns null (caller keeps the
 * original) when there are no usable dimensions or on any failure. Never throws.
 */
export async function padProductForFashion(
  bytes: Uint8Array,
  dims: Dims,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const fraction = paddingFraction(dims);
  if (fraction === null) return null;
  try {
    const sharp = await loadSharp();
    // Trim the surrounding margin so `fraction` is measured against the actual product, not the cutout's frame.
    const trimmed = await sharp(Buffer.from(bytes))
      .trim()
      .png()
      .toBuffer()
      .catch(() => null);
    const src = trimmed ?? Buffer.from(bytes);
    const meta = await sharp(src).metadata();
    const pw = meta.width ?? 0;
    const ph = meta.height ?? 0;
    if (pw <= 0 || ph <= 0) return null;
    const longSide = Math.max(pw, ph);
    const canvas = Math.max(longSide + 1, Math.round(longSide / fraction));
    const out = await sharp({
      create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: src, gravity: 'center' }])
      .png()
      .toBuffer();
    return { bytes: new Uint8Array(out), contentType: 'image/png' };
  } catch {
    return null;
  }
}

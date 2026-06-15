import sharp from 'sharp';

/**
 * Mask rasterization for pixel-perfect inpainting (#AI-gen v2). The placement step returns a normalized
 * region (0..1) of where the product goes; we rasterize it to a single-channel mask at the room's native
 * resolution — white = the area the inpaint model may change, black = keep the original pixels. A feather
 * (blur) softens the edge so the composite seam is invisible.
 */

/** A normalized rectangle in [0,1] image coordinates (origin top-left). */
export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

/** Clamp a normalized box to the image and to a minimum size, returning pixel coordinates. */
export function boxToPixels(
  box: NormalizedBox,
  width: number,
  height: number,
): { left: number; top: number; w: number; h: number } {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const w = clamp01(box.w);
  const h = clamp01(box.h);
  const left = Math.round(x * width);
  const top = Math.round(y * height);
  const pw = Math.max(1, Math.min(Math.round(w * width), width - left));
  const ph = Math.max(1, Math.min(Math.round(h * height), height - top));
  return { left, top, w: pw, h: ph };
}

/**
 * Rasterize a normalized region into a feathered grayscale PNG mask at `width`×`height`. `feather` is the
 * blur radius in px applied to soften the edge (0 = hard edge, deterministic).
 */
export async function rasterizeMask(opts: {
  width: number;
  height: number;
  box: NormalizedBox;
  feather?: number;
}): Promise<Uint8Array> {
  const { width, height } = opts;
  const { left, top, w, h } = boxToPixels(opts.box, width, height);

  const white = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  let canvas = sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).composite([{ input: white, left, top }]);

  const feather = opts.feather ?? 0;
  if (feather > 0) {
    canvas = sharp(await canvas.png().toBuffer()).blur(feather);
  }

  // `toColourspace('b-w')` forces a true single-channel grayscale (greyscale() alone keeps 3 channels).
  return new Uint8Array(await canvas.toColourspace('b-w').png().toBuffer());
}

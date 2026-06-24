import { loadSharp } from './sharp.js';

export interface Thumbnail {
  bytes: Uint8Array;
  contentType: 'image/webp';
}

export interface ThumbnailOptions {
  /** Longest-edge cap in px (default 512). The aspect ratio is preserved; small images aren't upscaled. */
  maxDim?: number;
  /** WebP quality 1–100 (default 72). */
  quality?: number;
}

/**
 * Produce a small long-lived WebP preview of a result image (retention §9). Best-effort: returns null on
 * any failure (sharp unavailable, non-image bytes) — a thumbnail must NEVER fail a generation, exactly
 * like the other image helpers (`autoOrientAndStrip`, the pixel-perfect composite).
 */
export async function makeThumbnail(
  bytes: Uint8Array,
  opts: ThumbnailOptions = {},
): Promise<Thumbnail | null> {
  const maxDim = opts.maxDim ?? 512;
  const quality = opts.quality ?? 72;
  try {
    const sharp = await loadSharp();
    const out = await sharp(Buffer.from(bytes))
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    return { bytes: new Uint8Array(out), contentType: 'image/webp' };
  } catch {
    return null;
  }
}

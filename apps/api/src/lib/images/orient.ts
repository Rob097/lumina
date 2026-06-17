import { loadSharp } from './sharp.js';
import { stripJpegMetadata } from './exif.js';

/**
 * Auto-orient + strip metadata at ingest (orientation correctness + HARD RULE #9, defense-in-depth).
 *
 * Cameras store portrait photos as landscape pixels plus an EXIF *orientation* tag. The pure-JS strip
 * ([stripJpegMetadata]) drops that tag WITHOUT rotating the pixels, so a portrait upload came out rotated
 * 90° — and the aspect-ratio pin then locked the wrong orientation in. Here we bake the EXIF orientation
 * into the pixels with sharp (`.rotate()` with no angle = auto-orient from EXIF) and emit metadata-free
 * bytes, so every downstream step (scene analysis, compose, the pixel-perfect base) sees the upright room.
 *
 * Only images that actually carry a non-trivial orientation are re-encoded; an already-upright image keeps
 * the cheap pure-JS strip (which preserves the bytes when they're already clean). sharp being unavailable
 * or the input being unreadable degrades to that same JS strip, so we never fail a generation over EXIF.
 */
export async function autoOrientAndStrip(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const sharp = await loadSharp();
    const orientation = (await sharp(Buffer.from(bytes), { failOn: 'none' }).metadata()).orientation ?? 1;
    if (orientation === 1) {
      // Upright already — no rotation to bake; the JS strip removes EXIF/GPS without a re-encode.
      return stripJpegMetadata(bytes);
    }
    // `.rotate()` with no argument applies the EXIF orientation to the pixels; sharp's default output
    // carries no metadata, so the orientation tag is gone and can't be applied a second time downstream.
    const out = await sharp(Buffer.from(bytes), { failOn: 'none' }).rotate().toBuffer();
    return new Uint8Array(out);
  } catch {
    return stripJpegMetadata(bytes);
  }
}

import type { Annotation } from '@lumina/shared';
import { loadSharp } from './sharp.js';

/**
 * Burn a freehand annotation (F3) onto a COPY of the room photo. The shopper's strokes (normalized 0..1
 * vectors) are rasterized as an SVG overlay at the room's native resolution and composited over the image,
 * so the model receives the room WITH the marks while the clean original is kept for the before/after and
 * the pixel-perfect composite. Best-effort: any failure (unreadable image, sharp error) returns the clean
 * room unchanged — an annotation must never fail a generation (HARD RULE #3 spirit).
 */

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

function formatToMime(format: string | undefined): string {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** Build an SVG overlay (same pixel size as the room) drawing each stroke as a rounded polyline. */
function buildSvg(annotation: Annotation, width: number, height: number): string {
  const longEdge = Math.max(width, height);
  const strokeWidth = Math.max(1, Math.round(annotation.width * longEdge));
  const polylines = annotation.strokes
    .map((stroke) => {
      const pts = stroke.points
        .map((p) => `${(clamp01(p.x) * width).toFixed(1)},${(clamp01(p.y) * height).toFixed(1)}`)
        .join(' ');
      return (
        `<polyline points="${pts}" fill="none" stroke="${annotation.color}" ` +
        `stroke-opacity="${annotation.alpha}" stroke-width="${strokeWidth}" ` +
        `stroke-linecap="round" stroke-linejoin="round" />`
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${polylines}</svg>`;
}

export async function burnAnnotation(
  room: Uint8Array,
  annotation: Annotation,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  try {
    const sharp = await loadSharp();
    const meta = await sharp(Buffer.from(room)).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const contentType = formatToMime(meta.format);
    if (!width || !height) {
      return { bytes: room, contentType };
    }
    const svg = Buffer.from(buildSvg(annotation, width, height));
    const out = await sharp(Buffer.from(room))
      .composite([{ input: svg, top: 0, left: 0 }])
      .toBuffer();
    return { bytes: new Uint8Array(out), contentType };
  } catch {
    // Never fail a generation over the annotation overlay — compose against the clean room instead.
    return { bytes: room, contentType: 'image/jpeg' };
  }
}

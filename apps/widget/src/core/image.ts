/**
 * Client image pipeline (§3 / D24): downscale to ≤ 2048 long-edge, apply EXIF orientation, and
 * re-encode (WebP → JPEG). Re-encoding through a canvas also strips EXIF/GPS, a client-side layer of
 * HARD RULE #9 (the server strips again). The math here is pure + unit-tested; `processImage` is the
 * thin canvas wrapper covered by the Playwright E2E.
 */

export const DEFAULT_MAX_EDGE = 2048;

export interface Size {
  width: number;
  height: number;
}

/** Scale `width`×`height` so the longest edge ≤ `maxEdge`, preserving aspect; never upscales. */
export function computeTargetSize(width: number, height: number, maxEdge = DEFAULT_MAX_EDGE): Size {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Parse the EXIF Orientation tag (1–8) from a JPEG; returns 1 for non-JPEG / missing EXIF. */
export function parseExifOrientation(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  if (view.byteLength < 2 || view.getUint16(0, false) !== 0xffd8) return 1; // not a JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if ((marker & 0xff00) !== 0xff00) break; // not a marker — give up

    if (marker === 0xffe1) {
      const exifStart = offset + 2; // skip the 2-byte segment length
      if (exifStart + 6 > view.byteLength || view.getUint32(exifStart, false) !== 0x45786966) {
        return 1; // not "Exif"
      }
      const tiffStart = exifStart + 6;
      const little = view.getUint16(tiffStart, false) === 0x4949;
      const ifdOffset = view.getUint32(tiffStart + 4, little);
      const dirStart = tiffStart + ifdOffset;
      if (dirStart + 2 > view.byteLength) return 1;
      const entries = view.getUint16(dirStart, little);
      for (let i = 0; i < entries; i++) {
        const entry = dirStart + 2 + i * 12;
        if (entry + 12 > view.byteLength) break;
        if (view.getUint16(entry, little) === 0x0112) {
          return view.getUint16(entry + 8, little) || 1;
        }
      }
      return 1;
    }

    // Skip this segment using its length field.
    const segLen = view.getUint16(offset, false);
    if (segLen < 2) break;
    offset += segLen;
  }
  return 1;
}

export interface Encoding {
  type: 'image/webp' | 'image/jpeg';
  quality: number;
}

/** Choose the output encoding — WebP (smaller) when the browser can encode it, else JPEG. */
export function pickEncoding(canEncodeWebp: boolean): Encoding {
  return canEncodeWebp ? { type: 'image/webp', quality: 0.82 } : { type: 'image/jpeg', quality: 0.85 };
}

export interface OrientationTransform extends Size {
  /** 2D affine matrix [a,b,c,d,e,f] to apply (`ctx.setTransform`) before drawing the image at 0,0. */
  matrix: [number, number, number, number, number, number];
}

/** Output canvas dims + the transform that bakes an EXIF orientation (1–8) into the pixels. */
export function applyOrientation(orientation: number, w: number, h: number): OrientationTransform {
  switch (orientation) {
    case 2:
      return { width: w, height: h, matrix: [-1, 0, 0, 1, w, 0] };
    case 3:
      return { width: w, height: h, matrix: [-1, 0, 0, -1, w, h] };
    case 4:
      return { width: w, height: h, matrix: [1, 0, 0, -1, 0, h] };
    case 5:
      return { width: h, height: w, matrix: [0, 1, 1, 0, 0, 0] };
    case 6:
      return { width: h, height: w, matrix: [0, 1, -1, 0, h, 0] };
    case 7:
      return { width: h, height: w, matrix: [0, -1, -1, 0, h, w] };
    case 8:
      return { width: h, height: w, matrix: [0, -1, 1, 0, 0, w] };
    default:
      return { width: w, height: h, matrix: [1, 0, 0, 1, 0, 0] };
  }
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  contentType: string;
}

function canEncodeWebp(): boolean {
  try {
    const c = document.createElement('canvas');
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * Decode → orient (EXIF) → downscale (≤ maxEdge) → re-encode. Browser-only (uses canvas); the pure
 * helpers above carry the tested logic, so this stays a thin shell exercised by the E2E.
 */
export async function processImage(
  file: Blob,
  options: { maxEdge?: number } = {},
): Promise<ProcessedImage> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const buffer = await file.arrayBuffer();
  const orientation = parseExifOrientation(buffer);
  const bitmap = await createImageBitmap(file);

  const oriented = applyOrientation(orientation, bitmap.width, bitmap.height);
  const target = computeTargetSize(oriented.width, oriented.height, maxEdge);
  const scale = oriented.width === 0 ? 1 : target.width / oriented.width;

  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  const [a, b, c, d, e, f] = oriented.matrix;
  ctx.setTransform(a * scale, b * scale, c * scale, d * scale, e * scale, f * scale);
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
  bitmap.close();

  const encoding = pickEncoding(canEncodeWebp());
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b2) => (b2 ? resolve(b2) : reject(new Error('image encoding failed'))),
      encoding.type,
      encoding.quality,
    );
  });

  return { blob, width: target.width, height: target.height, contentType: encoding.type };
}

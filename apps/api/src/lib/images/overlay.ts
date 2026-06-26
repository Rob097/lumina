import { loadSharp } from './sharp.js';

export interface OverlayBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Draw a placement-debug overlay (the computed product box + the detected anchor + a label) onto an image, so
 * the owner can VISUALLY validate the fashion placement detector cheaply — no image generation. Never throws:
 * on any failure it returns the original bytes. Used only behind the `FASHION_PLACEMENT_DEBUG` flag.
 */
export async function drawPlacementOverlay(
  imageBytes: Uint8Array,
  box: OverlayBox,
  opts: {
    anchor?: { x: number; y: number };
    label?: string;
    /** Detected part boxes (in pixels), drawn in a second colour so detection accuracy is visible. */
    parts?: { box: OverlayBox; label?: string }[];
  } = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  try {
    const sharp = await loadSharp();
    const meta = await sharp(Buffer.from(imageBytes)).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w <= 0 || h <= 0) {
      return { bytes: imageBytes, contentType: 'image/png' };
    }
    const anchorX = opts.anchor ? Math.round(opts.anchor.x * w) : box.left + Math.round(box.width / 2);
    const anchorY = opts.anchor ? Math.round(opts.anchor.y * h) : box.top;
    const stroke = Math.max(2, Math.round(w / 250));
    const dot = Math.max(4, Math.round(w / 120));
    const fontSize = Math.max(14, Math.round(w / 36));
    const esc = (s: string): string => s.replace(/[<>&]/g, ' ');
    const label = esc(opts.label ?? '');
    const rect =
      box.width > 0 && box.height > 0
        ? `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="none" stroke="#ff2d55" stroke-width="${stroke}"/>`
        : '';
    // Detected part boxes (e.g. the hands) in yellow, so we can see what the detector actually localized.
    const partRects = (opts.parts ?? [])
      .map(
        (p) =>
          `<rect x="${p.box.left}" y="${p.box.top}" width="${p.box.width}" height="${p.box.height}" fill="none" stroke="#ffd400" stroke-width="${stroke}"/>` +
          (p.label
            ? `<text x="${Math.max(2, p.box.left)}" y="${Math.max(fontSize, p.box.top - 4)}" font-family="sans-serif" font-size="${Math.round(fontSize * 0.7)}" fill="#ffd400" stroke="#000000" stroke-width="0.5">${esc(p.label)}</text>`
            : ''),
      )
      .join('');
    const text = label
      ? `<text x="${Math.max(6, box.left)}" y="${Math.max(fontSize + 4, box.top - 8)}" font-family="sans-serif" font-size="${fontSize}" fill="#ff2d55" stroke="#ffffff" stroke-width="1">${label}</text>`
      : '';
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${partRects}${rect}<circle cx="${anchorX}" cy="${anchorY}" r="${dot}" fill="#00e0ff" stroke="#003844" stroke-width="2"/>${text}</svg>`;
    const out = await sharp(Buffer.from(imageBytes))
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer();
    return { bytes: new Uint8Array(out), contentType: 'image/png' };
  } catch {
    return { bytes: imageBytes, contentType: 'image/png' };
  }
}

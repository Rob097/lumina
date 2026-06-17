import { loadSharp } from './sharp.js';
import { boxToPixels, type NormalizedBox } from './mask.js';

/**
 * Layout guide (Generation Engine v2 / Phase 5). Builds a rough composite — the product cutout *placed or
 * tiled* onto the normalized room at the scene-suggested region and real-world scale — that we hand to the
 * compose model in a REFINE pass. For a coverage product (acoustic panels, tiles, decking) the guide is a
 * regular grid filling the target surface, which is what finally yields aligned full-wall coverage instead
 * of a single floating unit. All placement math lives in pure helpers; the raster is a thin sharp pass that
 * degrades to the untouched room (never fails a generation).
 */

/** A pixel-space rectangle for one tile / paste. */
export interface Cell {
  left: number;
  top: number;
  w: number;
  h: number;
}

/** Default target surface when scene analysis gives no usable bbox: most of the frame (a wall). */
export const DEFAULT_WALL_BOX: NormalizedBox = { x: 0.06, y: 0.04, w: 0.88, h: 0.78 };

/** Upper bound per axis so a hallucinated coverage count can never produce microscopic tiles. */
const MAX_TILES_PER_AXIS = 24;

/**
 * Choose a grid (cols × rows) that covers `count` units of a product with the given aspect inside a
 * `boxW × boxH` region. Columns are driven by the product aspect so tiles keep a natural shape; rows then
 * round up to guarantee the grid holds at least `count` tiles. Pure.
 */
export function chooseGridDims(
  count: number,
  boxW: number,
  boxH: number,
  productAspect = 1,
): { cols: number; rows: number } {
  const n = Math.max(1, Math.min(Math.round(count), MAX_TILES_PER_AXIS * MAX_TILES_PER_AXIS));
  const a = productAspect > 0 ? productAspect : 1;
  const w = boxW > 0 ? boxW : 1;
  const h = boxH > 0 ? boxH : 1;
  // Target rows/cols ratio so each tile's aspect ≈ the product's: (boxW/cols)/(boxH/rows) = a.
  const k = (a * h) / w;
  const cols = Math.max(1, Math.min(Math.round(Math.sqrt(n / k)), MAX_TILES_PER_AXIS));
  const rows = Math.max(1, Math.min(Math.ceil(n / cols), MAX_TILES_PER_AXIS));
  return { cols, rows };
}

/**
 * Split a pixel box into `cols × rows` edge-to-edge cells. Cell edges are computed from the running float
 * boundary and rounded, so cells abut exactly (no gaps, no overlap) and the grid reaches the box edges. Pure.
 */
export function gridCells(box: Cell, cols: number, rows: number): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r += 1) {
    const y0 = Math.round(box.top + (r * box.h) / rows);
    const y1 = Math.round(box.top + ((r + 1) * box.h) / rows);
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.round(box.left + (c * box.w) / cols);
      const x1 = Math.round(box.left + ((c + 1) * box.w) / cols);
      cells.push({ left: x0, top: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) });
    }
  }
  return cells;
}

/**
 * Convert a normalized `[x0, y0, x1, y1]` bbox (from scene analysis) into an `{x, y, w, h}` box, falling
 * back when it's missing, the wrong length, or degenerate (non-positive width/height). Pure.
 */
export function bboxToBox(bbox: number[] | undefined, fallback: NormalizedBox): NormalizedBox {
  if (!bbox || bbox.length !== 4) {
    return fallback;
  }
  const [x0, y0, x1, y1] = bbox as [number, number, number, number];
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (w <= 0 || h <= 0) {
    return fallback;
  }
  return { x, y, w, h };
}

export interface CoverageLayoutOptions {
  room: Uint8Array;
  /** The product cutout (background-removed). Tiled into each cell. */
  cutout: Uint8Array;
  /** Normalized target surface region (origin top-left). */
  box: NormalizedBox;
  /** Coverage units to lay out (drives the grid density). */
  count: number;
  /** Product width/height for tile shaping (default 1 = square). */
  productAspect?: number;
  /** Trim the cutout's solid border before tiling so panels sit edge-to-edge (default true). */
  trimCutout?: boolean;
  contentType?: string;
}

/**
 * Render the coverage layout guide: tile the cutout across the target surface box on top of the room. Output
 * keeps the room's pixel dimensions. Best-effort — an unreadable room or any sharp failure returns the room
 * bytes unchanged so the caller can simply compose without a guide.
 */
export async function buildCoverageLayout(
  opts: CoverageLayoutOptions,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const contentType = opts.contentType ?? 'image/jpeg';
  const fallback = { bytes: opts.room, contentType };
  try {
    const sharp = await loadSharp();
    const meta = await sharp(Buffer.from(opts.room), { failOn: 'none' }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      return fallback;
    }

    const boxPx = boxToPixels(opts.box, width, height);
    const { cols, rows } = chooseGridDims(opts.count, boxPx.w, boxPx.h, opts.productAspect ?? 1);
    const cells = gridCells(boxPx, cols, rows);

    // Trim the cutout's solid (white) border once so each tiled panel fills its cell edge-to-edge.
    // Annotated `Buffer` (= Buffer<ArrayBufferLike>) so the `.toBuffer()` reassignment below type-checks
    // against `Buffer.from(Uint8Array)`'s narrower `Buffer<ArrayBuffer>`.
    let cutBuf: Buffer = Buffer.from(opts.cutout);
    if (opts.trimCutout !== false) {
      try {
        cutBuf = await sharp(cutBuf, { failOn: 'none' }).trim().toBuffer();
      } catch {
        cutBuf = Buffer.from(opts.cutout); // uniform / untrimmable — tile as-is
      }
    }

    const overlays = await Promise.all(
      cells.map(async (cell) => ({
        input: await sharp(cutBuf, { failOn: 'none' })
          .resize(cell.w, cell.h, { fit: 'fill' })
          .toBuffer(),
        left: cell.left,
        top: cell.top,
      })),
    );

    const out = await sharp(Buffer.from(opts.room), { failOn: 'none' }).composite(overlays).toBuffer();
    return { bytes: new Uint8Array(out), contentType };
  } catch {
    return fallback;
  }
}

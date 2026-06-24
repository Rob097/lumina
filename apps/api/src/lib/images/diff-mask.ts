import { loadSharp } from './sharp.js';

/**
 * Change detection for pixel-perfect compositing (#AI-gen v2). Gemini is reference-aware (it inserts the
 * exact product) but re-renders the whole frame; this finds where it actually changed the scene (the
 * product + its shadows) by diffing the model output against the original, so the composite step can keep
 * everything else byte-identical to the upload. The `changedFraction` lets the workflow fall back to the
 * full model output when the change is implausibly small (nothing happened) or large (a global re-frame).
 */
export interface ChangeMaskResult {
  /** Feathered single-channel mask: white where the edited image changed the original. */
  mask: Uint8Array;
  /** Fraction (0..1) of pixels that changed beyond the threshold (measured before feathering). */
  changedFraction: number;
  width: number;
  height: number;
}

export interface ChangeMaskOptions {
  /** Per-pixel color-distance threshold (0..255) above which a pixel counts as changed. */
  threshold?: number;
  /** Feather (blur) radius in px applied to the mask edge so the composite seam is invisible. */
  feather?: number;
  /**
   * Fill interior holes of the changed region before feathering. A product whose color matches the
   * background it covers (e.g. a white bag over a white dress) produces a sub-threshold diff there, so the
   * mask drops those pixels and the composite re-blends the ORIGINAL back in — making the product look
   * see-through. Filling holes that are fully enclosed by the changed silhouette keeps the product solid
   * without growing the mask outward (so the preserved face/scene region, which opens to the border, is
   * never touched). Used on the fashion path. See {@link fillInteriorHoles}.
   */
  fillHoles?: boolean;
}

const DEFAULT_THRESHOLD = 28;
const DEFAULT_FEATHER = 6;
const EMPTY: ChangeMaskResult = { mask: new Uint8Array(), changedFraction: 0, width: 0, height: 0 };

/**
 * Set every background (0) pixel that is NOT reachable from the image border to 255 — i.e. fill the holes
 * fully enclosed by the changed (255) silhouette, leaving border-connected background untouched. Pure: a
 * 4-connected flood from the border marks the "outside", then any unmarked 0-pixel is an interior hole.
 * Operates on the BINARY mask (values 0/255) before feathering.
 */
export function fillInteriorHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  if (n === 0 || mask.length < n) return mask;
  const outside = new Uint8Array(n); // 1 = background pixel reachable from the border
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (mask[i] === 0 && outside[i] === 0) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x += 1) {
    seed(x); // top row
    seed((height - 1) * width + x); // bottom row
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width); // left column
    seed(y * width + width - 1); // right column
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (y > 0) seed(i - width);
    if (y < height - 1) seed(i + width);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = mask[i] === 255 || outside[i] === 0 ? 255 : 0;
  }
  return out;
}

export async function computeChangeMask(
  original: Uint8Array,
  edited: Uint8Array,
  opts: ChangeMaskOptions = {},
): Promise<ChangeMaskResult> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const feather = opts.feather ?? DEFAULT_FEATHER;
  try {
    const sharp = await loadSharp();
    const meta = await sharp(Buffer.from(original)).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      return EMPTY;
    }

    const toRgb = (b: Uint8Array): Promise<Buffer> =>
      sharp(Buffer.from(b)).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const [o, e] = await Promise.all([toRgb(original), toRgb(edited)]);

    const n = width * height;
    const raw = Buffer.allocUnsafe(n);
    let changed = 0;
    for (let i = 0, p = 0; i < n; i += 1, p += 3) {
      const d = Math.max(
        Math.abs(o[p]! - e[p]!),
        Math.abs(o[p + 1]! - e[p + 1]!),
        Math.abs(o[p + 2]! - e[p + 2]!),
      );
      if (d > threshold) {
        raw[i] = 255;
        changed += 1;
      } else {
        raw[i] = 0;
      }
    }
    const changedFraction = n > 0 ? changed / n : 0;

    // Solidify the product silhouette before feathering so a low-contrast product isn't dropped (fashion path).
    const binary = opts.fillHoles ? Buffer.from(fillInteriorHoles(raw, width, height)) : raw;

    let maskImg = sharp(binary, { raw: { width, height, channels: 1 } });
    if (feather > 0) {
      maskImg = sharp(await maskImg.png().toBuffer()).blur(feather);
    }
    const mask = new Uint8Array(await maskImg.toColourspace('b-w').png().toBuffer());
    return { mask, changedFraction, width, height };
  } catch {
    return EMPTY;
  }
}

export interface CompositeGuard {
  minFraction?: number;
  maxFraction?: number;
}

/** Below this fraction the model effectively changed nothing; above it, it likely re-framed the scene. */
const DEFAULT_MIN_FRACTION = 0.002;
const DEFAULT_MAX_FRACTION = 0.6;

/**
 * Whether to composite the changed region over the original (true) or keep the model's full output. A
 * plausible local product insertion changes a modest fraction of the frame; too little or too much means
 * the diff is untrustworthy, so we fall back to the (still aspect-pinned) full render.
 */
export function shouldComposite(changedFraction: number, guard: CompositeGuard = {}): boolean {
  const min = guard.minFraction ?? DEFAULT_MIN_FRACTION;
  const max = guard.maxFraction ?? DEFAULT_MAX_FRACTION;
  return changedFraction >= min && changedFraction <= max;
}

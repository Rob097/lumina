import sharp from 'sharp';

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
}

const DEFAULT_THRESHOLD = 28;
const DEFAULT_FEATHER = 6;
const EMPTY: ChangeMaskResult = { mask: new Uint8Array(), changedFraction: 0, width: 0, height: 0 };

export async function computeChangeMask(
  original: Uint8Array,
  edited: Uint8Array,
  opts: ChangeMaskOptions = {},
): Promise<ChangeMaskResult> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const feather = opts.feather ?? DEFAULT_FEATHER;
  try {
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

    let maskImg = sharp(raw, { raw: { width, height, channels: 1 } });
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

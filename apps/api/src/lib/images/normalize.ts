import { loadSharp } from './sharp.js';

/**
 * Room normalization (Generation Engine v2 / Phase 3, D65): straighten and clean the uploaded room
 * **before** compose so the model sees the easy case, and use the normalized room as the baseline for the
 * pixel-perfect composite. Driven by the per-image scene analysis (Phase 2): a gentle, clamped deskew
 * using `tiltDegrees`, cropped to the largest inscribed rectangle (so rotation leaves no wedge borders),
 * plus a conditional auto-level when the scene flags the photo as dark. All transform math is in pure,
 * unit-tested helpers; `sharp` stays lazily loaded so a native issue degrades to the un-normalized room.
 */

/** Below this tilt we don't bother rotating — the gain is imperceptible and a rotate is lossy. */
const MIN_DESKEW_DEGREES = 0.5;

export const DEFAULT_DESKEW_MAX_DEGREES = 8;

/**
 * The counter-rotation to apply, in degrees: `-tiltDegrees` clamped to a gentle `[-max, max]` so the room
 * still looks like the user's room. Negligible tilt resolves to 0 (skip the rotate entirely). Pure.
 */
export function resolveDeskewAngle(tiltDegrees: number, maxDegrees: number): number {
  if (!Number.isFinite(tiltDegrees)) return 0;
  const counter = -tiltDegrees;
  if (Math.abs(counter) < MIN_DESKEW_DEGREES) return 0;
  return Math.max(-maxDegrees, Math.min(maxDegrees, counter));
}

/**
 * The largest rectangle of the **original aspect ratio**, centered, that fits inside a `width × height`
 * image rotated by `angleDeg` — i.e. the crop that removes the rotation wedges while keeping the room's
 * proportions. Pure; a 0° rotation is a no-op. (Each rotated corner's extent must stay within the source
 * half-extents; the binding scale is the smaller of the width/height constraints.)
 */
export function inscribedRect(
  width: number,
  height: number,
  angleDeg: number,
): { width: number; height: number } {
  const rad = (Math.abs(angleDeg) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const scaleW = width / (width * cos + height * sin);
  const scaleH = height / (width * sin + height * cos);
  const scale = Math.min(scaleW, scaleH);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** Auto-level only a dark photo, and only when the feature is enabled. Pure. */
export function shouldAutoLevel(dark: boolean, enabled: boolean): boolean {
  return enabled && dark;
}

export interface NormalizeRoomOptions {
  /** Signed tilt estimate from scene analysis (Phase 2). Undefined ⇒ no deskew. */
  tiltDegrees?: number;
  /** Scene `quality.dark` flag — gates the auto-level pass. */
  dark?: boolean;
  /** Gentle deskew clamp (env `DESKEW_MAX_DEGREES`, default 8). */
  maxDeskewDegrees?: number;
  /** Master switch for the auto-level pass (env `AUTOLEVEL_ENABLED`, default true). */
  autoLevelEnabled?: boolean;
}

/**
 * Produce the canonical room: deskew (clamped) + inscribed-rect crop + conditional auto-level. Best-effort
 * by contract — when there's nothing to do (level photo, not dark) OR `sharp` is unavailable, the original
 * bytes are returned unchanged, so a normalize hiccup never fails or re-frames a generation.
 */
export async function normalizeRoom(
  bytes: Uint8Array,
  opts: NormalizeRoomOptions = {},
): Promise<Uint8Array> {
  const maxDeskew = opts.maxDeskewDegrees ?? DEFAULT_DESKEW_MAX_DEGREES;
  const deskewAngle = resolveDeskewAngle(opts.tiltDegrees ?? 0, maxDeskew);
  const autoLevel = shouldAutoLevel(opts.dark ?? false, opts.autoLevelEnabled ?? true);

  if (deskewAngle === 0 && !autoLevel) {
    return bytes;
  }

  try {
    const sharp = await loadSharp();
    let pipeline = sharp(Buffer.from(bytes), { failOn: 'none' });
    const meta = await pipeline.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    if (deskewAngle !== 0 && width > 0 && height > 0) {
      // Rotate onto an expanded canvas, then crop the inscribed (original-aspect) rectangle from its centre.
      const rotated = sharp(await pipeline.rotate(deskewAngle, { background: '#000000' }).toBuffer(), {
        failOn: 'none',
      });
      const rotMeta = await rotated.metadata();
      const rotW = rotMeta.width ?? width;
      const rotH = rotMeta.height ?? height;
      const crop = inscribedRect(width, height, deskewAngle);
      const cropW = Math.min(crop.width, rotW);
      const cropH = Math.min(crop.height, rotH);
      pipeline = rotated.extract({
        left: Math.max(0, Math.floor((rotW - cropW) / 2)),
        top: Math.max(0, Math.floor((rotH - cropH) / 2)),
        width: cropW,
        height: cropH,
      });
    }

    if (autoLevel) {
      pipeline = pipeline.normalize();
    }

    const out = await pipeline.toBuffer();
    return new Uint8Array(out);
  } catch {
    // sharp missing or a transform failure → fall back to the un-normalized room (never fail a generation).
    return bytes;
  }
}

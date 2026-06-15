import sharp from 'sharp';

/**
 * Server-side image dimensions + aspect-ratio helpers (#AI-gen v2). Used to pin the compose output to
 * the uploaded room's aspect ratio so the model can't re-frame or rotate the scene.
 */

/** Aspect ratios the Gemini image models accept, as [label, value]. */
const SUPPORTED_ASPECT_RATIOS: ReadonlyArray<readonly [string, number]> = [
  ['1:1', 1 / 1],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['4:5', 4 / 5],
  ['5:4', 5 / 4],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
  ['21:9', 21 / 9],
];

/**
 * Read an image's pixel dimensions from its bytes. Defensive: unreadable bytes return `{0,0}` rather
 * than throwing, so a decode hiccup degrades to "no aspect-ratio pin" instead of failing the generation.
 */
export async function readImageSize(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(Buffer.from(bytes)).metadata();
    return { width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * The supported aspect ratio closest to the given dimensions (by ratio distance). Returns `null` for
 * a degenerate size so callers can simply omit the pin. Pure — unit-testable without an image.
 */
export function nearestAspectRatio(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) {
    return null;
  }
  const target = width / height;
  let best = SUPPORTED_ASPECT_RATIOS[0]!;
  let bestDelta = Math.abs(Math.log(target / best[1]));
  for (const candidate of SUPPORTED_ASPECT_RATIOS) {
    const delta = Math.abs(Math.log(target / candidate[1]));
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best[0];
}

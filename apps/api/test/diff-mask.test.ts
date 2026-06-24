import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { computeChangeMask, fillInteriorHoles, shouldComposite } from '../src/lib/images/diff-mask';

const W = 255;
/** Build a single-channel binary mask from a grid of 0/255 rows (helper for the pure hole-fill tests). */
function maskFrom(rows: number[][]): { mask: Uint8Array; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]!.length;
  return { mask: Uint8Array.from(rows.flat()), width, height };
}

async function solid(width: number, height: number, rgb: { r: number; g: number; b: number }): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: rgb } }).png().toBuffer());
}

describe('computeChangeMask', () => {
  it('reports no change for identical images', async () => {
    const img = await solid(80, 80, { r: 120, g: 130, b: 140 });
    const r = await computeChangeMask(img, img, { feather: 0 });
    expect(r.changedFraction).toBe(0);
  });

  it('isolates the changed region (a recolored center square)', async () => {
    const original = await solid(100, 100, { r: 255, g: 0, b: 0 });
    const blue = await solid(50, 50, { r: 0, g: 0, b: 255 });
    const edited = new Uint8Array(
      await sharp(Buffer.from(original)).composite([{ input: Buffer.from(blue), left: 25, top: 25 }]).png().toBuffer(),
    );

    const r = await computeChangeMask(original, edited, { feather: 0 });
    expect(r.width).toBe(100);
    expect(r.changedFraction).toBeCloseTo(0.25, 1);

    const { data, info } = await sharp(Buffer.from(r.mask)).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number): number => data[(y * info.width + x) * info.channels] ?? 0;
    expect(at(50, 50)).toBeGreaterThan(200); // changed center → white
    expect(at(2, 2)).toBeLessThan(50); // untouched corner → black
  });

  it('returns an empty result for unreadable bytes (never throws)', async () => {
    const r = await computeChangeMask(Uint8Array.from([1, 2, 3]), Uint8Array.from([4, 5, 6]));
    expect(r).toMatchObject({ changedFraction: 0, width: 0, height: 0 });
  });

  it('fillHoles solidifies a hollow changed ring (low-contrast product interior is not dropped)', async () => {
    // A blue ring with the ORIGINAL red punched back into its center → the center is "unchanged" (a hole the
    // composite would otherwise fill with the original, making a low-contrast product look see-through).
    const original = await solid(100, 100, { r: 255, g: 0, b: 0 });
    const blue = await solid(50, 50, { r: 0, g: 0, b: 255 });
    const redHole = await solid(20, 20, { r: 255, g: 0, b: 0 });
    const edited = new Uint8Array(
      await sharp(Buffer.from(original))
        .composite([
          { input: Buffer.from(blue), left: 25, top: 25 },
          { input: Buffer.from(redHole), left: 40, top: 40 },
        ])
        .png()
        .toBuffer(),
    );

    const centerOf = async (mask: Uint8Array): Promise<number> => {
      const { data, info } = await sharp(Buffer.from(mask)).raw().toBuffer({ resolveWithObject: true });
      return data[(50 * info.width + 50) * info.channels] ?? 0;
    };

    const without = await computeChangeMask(original, edited, { feather: 0 });
    expect(await centerOf(without.mask)).toBeLessThan(50); // hole stays black → product would be see-through here

    const withFill = await computeChangeMask(original, edited, { feather: 0, fillHoles: true });
    expect(await centerOf(withFill.mask)).toBeGreaterThan(200); // enclosed hole filled → product stays solid
  });
});

describe('fillInteriorHoles (pure border-flood hole fill)', () => {
  it('fills a 0-region fully enclosed by 255', () => {
    const { mask, width, height } = maskFrom([
      [0, 0, 0, 0, 0],
      [0, W, W, W, 0],
      [0, W, 0, W, 0],
      [0, W, W, W, 0],
      [0, 0, 0, 0, 0],
    ]);
    const out = fillInteriorHoles(mask, width, height);
    expect(out[2 * width + 2]).toBe(255); // enclosed hole → filled
    expect(out[0]).toBe(0); // border background → untouched
  });

  it('never fills background connected to the border (e.g. the preserved face/scene region)', () => {
    // A 255 blob in the corner with an open 0-region reaching the border must stay 0 everywhere outside it.
    const { mask, width, height } = maskFrom([
      [W, W, 0, 0, 0],
      [W, W, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
    const out = fillInteriorHoles(mask, width, height);
    expect(out).toEqual(mask); // nothing enclosed → identical
  });

  it('leaves a genuinely transparent gap that opens to the border unfilled (e.g. a handle loop at the edge)', () => {
    const { mask, width, height } = maskFrom([
      [W, W, W, W, W],
      [W, 0, 0, 0, W],
      [W, W, 0, W, W],
      [0, 0, 0, 0, 0], // the gap opens out to the bottom border → reachable → not enclosed
      [0, 0, 0, 0, 0],
    ]);
    const out = fillInteriorHoles(mask, width, height);
    expect(out[1 * width + 2]).toBe(0); // gap still open to the border → stays background
  });
});

describe('shouldComposite', () => {
  it('composites a plausible local change but not a no-op or a global re-frame', () => {
    expect(shouldComposite(0.0001)).toBe(false); // basically nothing changed
    expect(shouldComposite(0.25)).toBe(true); // a real local insertion
    expect(shouldComposite(0.9)).toBe(false); // whole frame changed → likely re-framed
  });

  it('honors custom guard bounds', () => {
    expect(shouldComposite(0.05, { minFraction: 0.1 })).toBe(false);
    expect(shouldComposite(0.5, { maxFraction: 0.4 })).toBe(false);
  });
});

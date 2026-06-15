import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { computeChangeMask, shouldComposite } from '../src/lib/images/diff-mask';

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

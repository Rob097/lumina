import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { paddingFraction, padProductForFashion } from '../src/lib/images/product-pad';

/** A small opaque square on a transparent canvas (a stand-in product cutout). */
async function cutout(size: number): Promise<Uint8Array> {
  const block = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 180, g: 120, b: 90, alpha: 1 } } })
    .png()
    .toBuffer();
  // Put it on a slightly larger transparent canvas so trim() has a margin to remove.
  const out = await sharp({ create: { width: size + 20, height: size + 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: block, gravity: 'center' }])
    .png()
    .toBuffer();
  return new Uint8Array(out);
}

describe('paddingFraction', () => {
  it('shrinks small products more (linear in real width) and skips when no dims / already large', () => {
    expect(paddingFraction({ w: 120, unit: 'cm' })).toBeNull(); // >= ref (120) => no padding
    expect(paddingFraction(undefined)).toBeNull();
    expect(paddingFraction(null)).toBeNull();
    const f20 = paddingFraction({ w: 20, unit: 'cm' })!;
    const f40 = paddingFraction({ w: 40, unit: 'cm' })!;
    expect(f20).toBeCloseTo(20 / 120, 5);
    expect(f20).toBeLessThan(f40); // smaller real size => smaller fraction => rendered smaller
  });
  it('converts inches and clamps to a floor', () => {
    expect(paddingFraction({ w: 1, unit: 'cm' })).toBe(0.12); // floored
    expect(paddingFraction({ w: 8, unit: 'in' })!).toBeCloseTo((8 * 2.54) / 120, 5);
  });
});

describe('padProductForFashion', () => {
  it('returns a larger (padded) canvas so the product occupies less of the frame', async () => {
    const src = await cutout(100);
    const out = await padProductForFashion(src, { w: 20, h: 10, unit: 'cm' });
    expect(out).not.toBeNull();
    const meta = await sharp(Buffer.from(out!.bytes)).metadata();
    // product long side ~100 trimmed; fraction 20/55 ~0.36 => canvas ~ 100/0.36 ~ 275 (well above 100)
    expect((meta.width ?? 0)).toBeGreaterThan(150);
    expect(meta.width).toBe(meta.height); // square canvas
    expect(out!.contentType).toBe('image/png');
  });
  it('no-ops (null) when there are no dimensions or the product is already large', async () => {
    const src = await cutout(100);
    expect(await padProductForFashion(src, undefined)).toBeNull();
    expect(await padProductForFashion(src, { w: 130, unit: 'cm' })).toBeNull(); // >= ref (120)
  });
});

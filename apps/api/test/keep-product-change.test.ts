import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { keepOnlyProductChange } from '../src/lib/inngest/workflow';

const W = 100;
const H = 100;

type Rgb = { r: number; g: number; b: number };

async function rect(w: number, h: number, rgb: Rgb): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer();
}

/** Compose a few solid rects over a white base, returning PNG bytes at W×H. */
async function canvas(rects: Array<{ left: number; w: number; rgb: Rgb }>): Promise<Uint8Array> {
  const composite = await Promise.all(
    rects.map(async (r) => ({ input: await rect(r.w, H, r.rgb), left: r.left, top: 0 })),
  );
  const out = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(composite)
    .png()
    .toBuffer();
  return new Uint8Array(out);
}

async function pixel(bytes: Uint8Array, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(Buffer.from(bytes)).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
}

const MARK: Rgb = { r: 150, g: 150, b: 150 }; // translucent highlight burned over a white wall
const PRODUCT: Rgb = { r: 0, g: 0, b: 255 }; // the placed product

describe('keepOnlyProductChange — annotation marks are always removed (F3)', () => {
  it('restores clean pixels where the model RETAINED the marks, diffing against the burned room', async () => {
    const clean = await canvas([]); // pristine white room
    const burned = await canvas([{ left: 5, w: 20, rgb: MARK }]); // what the model actually saw
    // The model kept the highlight stripe untouched (cols 5-25) and placed a product (cols 55-95).
    const composed = await canvas([
      { left: 5, w: 20, rgb: MARK },
      { left: 55, w: 40, rgb: PRODUCT },
    ]);

    const out = await keepOnlyProductChange(
      clean,
      { bytes: composed, contentType: 'image/png' },
      { diffReference: burned },
    );

    // Marked-but-unchanged wall → the model left the marks, but the result MUST show the clean wall.
    expect(await pixel(out.bytes, 15, 50)).toEqual([255, 255, 255]);
    // Where the product was placed → keep the model's output (centre, clear of the feathered seam).
    expect(await pixel(out.bytes, 75, 50)).toEqual([0, 0, 255]);
    // Untouched region between the two → clean wall.
    expect(await pixel(out.bytes, 40, 50)).toEqual([255, 255, 255]);
  });

  it('without a diff reference, behaves as before (diffs against the original)', async () => {
    const clean = await canvas([]);
    const composed = await canvas([{ left: 55, w: 40, rgb: PRODUCT }]);

    const out = await keepOnlyProductChange(clean, { bytes: composed, contentType: 'image/png' });

    expect(await pixel(out.bytes, 75, 50)).toEqual([0, 0, 255]); // product kept
    expect(await pixel(out.bytes, 15, 50)).toEqual([255, 255, 255]); // rest is the clean room
  });
});

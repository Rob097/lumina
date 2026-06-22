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

const PRODUCT: Rgb = { r: 0, g: 0, b: 255 }; // the placed product

describe('keepOnlyProductChange', () => {
  it('keeps the model output where it changed the scene and restores the clean room elsewhere', async () => {
    const clean = await canvas([]); // pristine white room
    const composed = await canvas([{ left: 55, w: 40, rgb: PRODUCT }]); // model placed a product on the right

    const out = await keepOnlyProductChange(clean, { bytes: composed, contentType: 'image/png' });

    expect(await pixel(out.bytes, 75, 50)).toEqual([0, 0, 255]); // product region → kept
    expect(await pixel(out.bytes, 15, 50)).toEqual([255, 255, 255]); // untouched → clean room
  });

  it('keeps a product solid regardless of where the (model-input) strokes were — no special stroke handling', async () => {
    // The composite is annotation-agnostic: it only sees the clean room + the model output, never the strokes.
    // A product placed anywhere is kept solid by the plain diff — no holes from a stroke region.
    const clean = await canvas([]);
    const composed = await canvas([{ left: 20, w: 60, rgb: PRODUCT }]); // a wide product over the drawn area

    const out = await keepOnlyProductChange(clean, { bytes: composed, contentType: 'image/png' });

    expect(await pixel(out.bytes, 50, 50)).toEqual([0, 0, 255]); // centre → solid product, no missing piece
  });
});

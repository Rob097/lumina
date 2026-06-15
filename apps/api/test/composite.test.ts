import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { compositeOverOriginal } from '../src/lib/images/composite';
import { rasterizeMask } from '../src/lib/images/mask';

async function solid(width: number, height: number, rgb: { r: number; g: number; b: number }): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: rgb } }).png().toBuffer());
}

describe('compositeOverOriginal', () => {
  it('keeps original pixels outside the mask byte-identical and uses the edited image inside it', async () => {
    const original = await solid(100, 100, { r: 255, g: 0, b: 0 }); // red scene
    const edited = await solid(100, 100, { r: 0, g: 0, b: 255 }); // blue "inpaint"
    const mask = await rasterizeMask({
      width: 100,
      height: 100,
      box: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      feather: 0,
    });

    const out = await compositeOverOriginal({ original, edited, mask, contentType: 'image/png' });
    const { data, info } = await sharp(Buffer.from(out.bytes)).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number): [number, number, number] => {
      const i = (y * info.width + x) * info.channels;
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    };

    // Corner is outside the mask → exactly the original red.
    expect(px(3, 3)).toEqual([255, 0, 0]);
    // Center is inside the mask → the edited blue.
    expect(px(50, 50)).toEqual([0, 0, 255]);
  });

  it('falls back to the edited image when the original is unreadable', async () => {
    const edited = await solid(10, 10, { r: 1, g: 2, b: 3 });
    const out = await compositeOverOriginal({
      original: Uint8Array.from([0, 1, 2, 3]),
      edited,
      mask: edited,
    });
    expect(out.bytes).toBe(edited);
  });
});

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { boxToPixels, rasterizeMask } from '../src/lib/images/mask';

describe('boxToPixels', () => {
  it('maps a full-frame normalized box to the whole image', () => {
    expect(boxToPixels({ x: 0, y: 0, w: 1, h: 1 }, 200, 100)).toEqual({ left: 0, top: 0, w: 200, h: 100 });
  });

  it('clamps a box that overflows the image bounds', () => {
    expect(boxToPixels({ x: 0.5, y: 0.5, w: 1, h: 1 }, 100, 100)).toEqual({
      left: 50,
      top: 50,
      w: 50,
      h: 50,
    });
  });
});

describe('rasterizeMask', () => {
  it('paints white inside the region and black outside (hard edge)', async () => {
    const mask = await rasterizeMask({
      width: 100,
      height: 100,
      box: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      feather: 0,
    });
    const { data, info } = await sharp(Buffer.from(mask)).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number): number => data[(y * info.width + x) * info.channels] ?? 0;
    expect(at(50, 50)).toBeGreaterThan(200); // center → editable (white)
    expect(at(2, 2)).toBeLessThan(50); // corner → keep original (black)
  });
});

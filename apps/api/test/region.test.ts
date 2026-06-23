import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { DrawnRegionBox } from '@lumina/shared';
import { driftOutsideRegion, containInRegion } from '../src/lib/images/region';

const W = 40;
const H = 40;
// Bottom-right quadrant → pixels x>=20, y>=20.
const box: DrawnRegionBox = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };

async function png(fill: (x: number, y: number) => [number, number, number]): Promise<Uint8Array> {
  const buf = Buffer.allocUnsafe(W * H * 3);
  for (let y = 0, p = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1, p += 3) {
      const [r, g, b] = fill(x, y);
      buf[p] = r;
      buf[p + 1] = g;
      buf[p + 2] = b;
    }
  }
  return new Uint8Array(await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer());
}

describe('driftOutsideRegion', () => {
  it('is ~0 when only the drawn region changed', async () => {
    const original = await png(() => [128, 128, 128]);
    const edited = await png((x, y) => (x >= 20 && y >= 20 ? [255, 0, 0] : [128, 128, 128]));
    expect(await driftOutsideRegion(original, edited, box)).toBeLessThan(0.01);
  });

  it('rises when pixels outside the region changed', async () => {
    const original = await png(() => [128, 128, 128]);
    const edited = await png((_x, y) => (y < 20 ? [255, 0, 0] : [128, 128, 128])); // whole top half
    expect(await driftOutsideRegion(original, edited, box)).toBeGreaterThan(0.3);
  });
});

describe('containInRegion', () => {
  it('keeps the original outside the box and the edited inside', async () => {
    const original = await png(() => [10, 20, 30]);
    const edited = await png(() => [200, 100, 50]);
    const out = await containInRegion({ original, edited, box, feather: 0 });
    const { data, info } = await sharp(Buffer.from(out.bytes)).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number): number => data[(y * info.width + x) * info.channels] ?? 0;
    expect(at(2, 2)).toBeLessThan(60); // corner, outside region → original (r=10)
    expect(at(35, 35)).toBeGreaterThan(150); // deep inside region → edited (r=200)
  });
});

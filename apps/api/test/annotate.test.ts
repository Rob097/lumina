import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { Annotation } from '@lumina/shared';
import { burnAnnotation } from '../src/lib/images/annotate.js';

async function solid(rgb: { r: number; g: number; b: number }, w = 100, h = 100): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer());
}

describe('burnAnnotation', () => {
  it('burns the strokes onto a copy of the room (marked pixels change, others preserved)', async () => {
    const room = await solid({ r: 255, g: 255, b: 255 }); // white room
    const annotation: Annotation = {
      color: '#000000',
      alpha: 1,
      width: 0.1,
      strokes: [{ points: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }] }], // a thick black line down the centre
    };
    const { bytes } = await burnAnnotation(room, annotation);

    const { data, info } = await sharp(Buffer.from(bytes)).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number): number => data[(y * info.width + x) * info.channels] ?? 255;
    expect(px(50, 50)).toBeLessThan(128); // centre darkened by the stroke
    expect(px(3, 3)).toBe(255); // corner untouched — original room pixels preserved
  });

  it('returns the image unchanged when the bytes are not a readable image (degrade, never throws)', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4]);
    const annotation: Annotation = {
      color: '#000000',
      alpha: 1,
      width: 0.1,
      strokes: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
    };
    const { bytes } = await burnAnnotation(garbage, annotation);
    expect(bytes).toEqual(garbage);
  });
});

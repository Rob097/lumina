import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { autoOrientAndStrip } from '../src/lib/images/orient.js';
import { readImageSize } from '../src/lib/images/dimensions.js';

/** A 40×20 landscape JPEG tagged with an EXIF orientation flag (no pixel rotation applied yet). */
async function landscapeWithOrientation(orientation: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 120, g: 80, b: 40 } },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

describe('autoOrientAndStrip', () => {
  it('bakes EXIF orientation into the pixels so a portrait photo stays portrait', async () => {
    // Orientation 6 = "rotate 90° to display": the stored 40×20 landscape must become a 20×40 portrait.
    const input = await landscapeWithOrientation(6);
    expect(await readImageSize(input)).toEqual({ width: 40, height: 20 }); // raw pixels are landscape
    const out = await autoOrientAndStrip(input);
    expect(await readImageSize(out)).toEqual({ width: 20, height: 40 });
  });

  it('strips the EXIF orientation tag so it can never be applied twice downstream', async () => {
    const out = await autoOrientAndStrip(await landscapeWithOrientation(6));
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(meta.orientation ?? 1).toBe(1);
  });

  it('leaves an already-upright image upright', async () => {
    const out = await autoOrientAndStrip(await landscapeWithOrientation(1));
    expect(await readImageSize(out)).toEqual({ width: 40, height: 20 });
  });

  it('returns non-image bytes unchanged (degrades to the pure-JS strip)', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(await autoOrientAndStrip(bytes)).toBe(bytes);
  });
});

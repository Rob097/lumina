import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { makeThumbnail } from '../src/lib/images/thumbnail.js';
import { readImageSize } from '../src/lib/images/dimensions.js';

async function solidJpeg(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

describe('makeThumbnail', () => {
  it('downscales a large image to a small WebP within the max dimension', async () => {
    const input = await solidJpeg(1600, 1200);
    const thumb = await makeThumbnail(input, { maxDim: 512 });
    expect(thumb).not.toBeNull();
    expect(thumb!.contentType).toBe('image/webp');
    const size = await readImageSize(thumb!.bytes);
    expect(Math.max(size.width ?? 0, size.height ?? 0)).toBeLessThanOrEqual(512);
    // aspect ratio preserved (4:3)
    expect(size.width).toBe(512);
    expect(size.height).toBe(384);
    // a thumbnail must be much smaller than the source
    expect(thumb!.bytes.byteLength).toBeLessThan(input.byteLength);
  });

  it('does not upscale an already-small image', async () => {
    const input = await solidJpeg(200, 200);
    const thumb = await makeThumbnail(input, { maxDim: 512 });
    const size = await readImageSize(thumb!.bytes);
    expect(size.width).toBe(200);
    expect(size.height).toBe(200);
  });

  it('returns null on non-image bytes (never throws — must not fail a generation)', async () => {
    const thumb = await makeThumbnail(new Uint8Array([1, 2, 3, 4]));
    expect(thumb).toBeNull();
  });
});

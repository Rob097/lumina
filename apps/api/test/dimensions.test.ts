import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { nearestAspectRatio, readImageSize } from '../src/lib/images/dimensions';

describe('nearestAspectRatio', () => {
  it('maps common photo shapes to the closest supported ratio', () => {
    expect(nearestAspectRatio(1600, 1200)).toBe('4:3'); // landscape 4:3
    expect(nearestAspectRatio(1200, 1600)).toBe('3:4'); // portrait
    expect(nearestAspectRatio(1920, 1080)).toBe('16:9'); // widescreen
    expect(nearestAspectRatio(1000, 1000)).toBe('1:1'); // square
    expect(nearestAspectRatio(1080, 1920)).toBe('9:16'); // tall phone
  });

  it('snaps a near-miss ratio to the closest option', () => {
    // 3:2 (1.5) photo is closer to 3:2 than to 4:3 (1.33) or 16:9 (1.78)
    expect(nearestAspectRatio(1500, 1000)).toBe('3:2');
  });

  it('returns null for a degenerate size so callers can omit the pin', () => {
    expect(nearestAspectRatio(0, 100)).toBeNull();
    expect(nearestAspectRatio(100, 0)).toBeNull();
  });
});

describe('readImageSize', () => {
  it('reads pixel dimensions from image bytes', async () => {
    const png = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    expect(await readImageSize(new Uint8Array(png))).toEqual({ width: 320, height: 240 });
  });

  it('returns {0,0} for unreadable bytes instead of throwing', async () => {
    expect(await readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({ width: 0, height: 0 });
  });
});

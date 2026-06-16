import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  inscribedRect,
  normalizeRoom,
  resolveDeskewAngle,
  shouldAutoLevel,
} from '../src/lib/images/normalize.js';

async function solidJpeg(
  width: number,
  height: number,
  rgb: { r: number; g: number; b: number },
): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: rgb } }).jpeg().toBuffer());
}

async function size(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const m = await sharp(Buffer.from(bytes)).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

describe('resolveDeskewAngle', () => {
  it('counter-rotates by -tiltDegrees', () => {
    expect(resolveDeskewAngle(3, 8)).toBeCloseTo(-3);
    expect(resolveDeskewAngle(-4, 8)).toBeCloseTo(4);
  });

  it('clamps to the gentle max so the room never warps', () => {
    expect(resolveDeskewAngle(25, 8)).toBeCloseTo(-8);
    expect(resolveDeskewAngle(-30, 8)).toBeCloseTo(8);
  });

  it('ignores negligible tilt (no needless rotation)', () => {
    expect(resolveDeskewAngle(0, 8)).toBe(0);
    expect(resolveDeskewAngle(0.2, 8)).toBe(0);
    expect(resolveDeskewAngle(-0.3, 8)).toBe(0);
  });
});

describe('inscribedRect', () => {
  it('is a no-op at zero rotation', () => {
    expect(inscribedRect(1000, 800, 0)).toEqual({ width: 1000, height: 800 });
  });

  it('shrinks both sides for a rotation and preserves the original aspect ratio', () => {
    const r = inscribedRect(1000, 800, 8);
    expect(r.width).toBeLessThan(1000);
    expect(r.height).toBeLessThan(800);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    // aspect ratio preserved within rounding
    expect(r.width / r.height).toBeCloseTo(1000 / 800, 1);
  });

  it('is symmetric in the sign of the angle', () => {
    expect(inscribedRect(1000, 800, 8)).toEqual(inscribedRect(1000, 800, -8));
  });
});

describe('shouldAutoLevel', () => {
  it('levels only a dark photo when enabled', () => {
    expect(shouldAutoLevel(true, true)).toBe(true);
    expect(shouldAutoLevel(true, false)).toBe(false);
    expect(shouldAutoLevel(false, true)).toBe(false);
    expect(shouldAutoLevel(false, false)).toBe(false);
  });
});

describe('normalizeRoom', () => {
  it('returns the input untouched for a level, non-dark photo (nothing to do)', async () => {
    const img = await solidJpeg(200, 160, { r: 120, g: 130, b: 140 });
    const out = await normalizeRoom(img, { tiltDegrees: 0, dark: false });
    expect(out).toBe(img); // same reference — no sharp work
  });

  it('ignores negligible tilt', async () => {
    const img = await solidJpeg(200, 160, { r: 120, g: 130, b: 140 });
    expect(await normalizeRoom(img, { tiltDegrees: 0.2 })).toBe(img);
  });

  it('deskews and crops to the inscribed rectangle (no wedge borders, dims match the pure helper)', async () => {
    const img = await solidJpeg(400, 300, { r: 100, g: 110, b: 120 });
    const out = await normalizeRoom(img, { tiltDegrees: 6, maxDeskewDegrees: 8 });
    expect(out).not.toBe(img);
    const dims = await size(out);
    const expected = inscribedRect(400, 300, resolveDeskewAngle(6, 8));
    expect(dims.width).toBe(expected.width);
    expect(dims.height).toBe(expected.height);
    expect(dims.width).toBeLessThan(400);
  });

  it('auto-levels a dark photo without changing its dimensions', async () => {
    const img = await solidJpeg(200, 160, { r: 8, g: 8, b: 8 });
    const out = await normalizeRoom(img, { tiltDegrees: 0, dark: true, autoLevelEnabled: true });
    expect(out).not.toBe(img);
    expect(await size(out)).toEqual({ width: 200, height: 160 });
  });

  it('skips the auto-level when the feature is disabled', async () => {
    const img = await solidJpeg(200, 160, { r: 8, g: 8, b: 8 });
    expect(await normalizeRoom(img, { tiltDegrees: 0, dark: true, autoLevelEnabled: false })).toBe(img);
  });
});

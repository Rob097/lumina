import { describe, it, expect } from 'vitest';
import {
  computeTargetSize,
  parseExifOrientation,
  pickEncoding,
  applyOrientation,
} from '../src/core/image.js';

/** Build a minimal EXIF JPEG carrying a single Orientation tag (0x0112). */
function makeExifJpeg(orientation: number, little = false): ArrayBuffer {
  const tiff = new Uint8Array(26);
  const dv = new DataView(tiff.buffer);
  dv.setUint16(0, little ? 0x4949 : 0x4d4d, false); // byte order
  dv.setUint16(2, 0x002a, little);
  dv.setUint32(4, 8, little); // IFD0 offset
  dv.setUint16(8, 1, little); // entry count
  dv.setUint16(10, 0x0112, little); // Orientation tag
  dv.setUint16(12, 3, little); // type SHORT
  dv.setUint32(14, 1, little); // count
  dv.setUint16(18, orientation, little); // value
  dv.setUint32(22, 0, little); // next IFD

  const exif = new Uint8Array(6 + tiff.length);
  exif.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0); // "Exif\0\0"
  exif.set(tiff, 6);

  const app1Len = exif.length + 2;
  const out = new Uint8Array(6 + exif.length + 2);
  let o = 0;
  out[o++] = 0xff;
  out[o++] = 0xd8; // SOI
  out[o++] = 0xff;
  out[o++] = 0xe1; // APP1
  out[o++] = (app1Len >> 8) & 0xff;
  out[o++] = app1Len & 0xff;
  out.set(exif, o);
  o += exif.length;
  out[o++] = 0xff;
  out[o++] = 0xd9; // EOI
  return out.buffer;
}

describe('computeTargetSize', () => {
  it('caps the long edge while preserving aspect ratio', () => {
    expect(computeTargetSize(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(computeTargetSize(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it('never upscales an image already within budget', () => {
    expect(computeTargetSize(1000, 500, 2048)).toEqual({ width: 1000, height: 500 });
  });
});

describe('parseExifOrientation', () => {
  it('reads the orientation tag (big- and little-endian)', () => {
    expect(parseExifOrientation(makeExifJpeg(6, false))).toBe(6);
    expect(parseExifOrientation(makeExifJpeg(8, true))).toBe(8);
    expect(parseExifOrientation(makeExifJpeg(1))).toBe(1);
  });

  it('defaults to 1 for non-JPEG / missing EXIF', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    expect(parseExifOrientation(png)).toBe(1);
    const bareJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    expect(parseExifOrientation(bareJpeg)).toBe(1);
  });
});

describe('pickEncoding', () => {
  it('prefers WebP when supported, else JPEG', () => {
    expect(pickEncoding(true).type).toBe('image/webp');
    expect(pickEncoding(false).type).toBe('image/jpeg');
  });
});

describe('applyOrientation', () => {
  it('keeps dimensions + identity matrix for orientation 1', () => {
    expect(applyOrientation(1, 1200, 800)).toEqual({
      width: 1200,
      height: 800,
      matrix: [1, 0, 0, 1, 0, 0],
    });
  });

  it('swaps width/height for 90°/270° rotations (6 and 8)', () => {
    expect(applyOrientation(6, 1200, 800)).toMatchObject({ width: 800, height: 1200 });
    expect(applyOrientation(8, 1200, 800)).toMatchObject({ width: 800, height: 1200 });
  });
});

import { describe, expect, it } from 'vitest';
import { stripJpegMetadata } from '../src/lib/images/exif.js';

const ASCII = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

function contains(hay: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** A tiny but structurally-valid JPEG: SOI · APP0(JFIF) · APP1(Exif) · SOS · scan · EOI. */
function jpegWithExif(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, ...ASCII('JFIF'), 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0 (len 0x10)
    0xff, 0xe1, 0x00, 0x0c, ...ASCII('Exif'), 0x00, 0x00, 0x2a, 0x2a, 0x2a, 0x2a, // APP1 EXIF (len 0x0c)
    0xff, 0xda, 0x00, 0x03, 0x01, // SOS (len 3 → 1 byte payload)
    0xaa, 0xbb, 0xcc, // scan data
    0xff, 0xd9, // EOI
  ]);
}

describe('stripJpegMetadata', () => {
  it('removes the EXIF APP1 segment but keeps JFIF + scan data', () => {
    const out = stripJpegMetadata(jpegWithExif());
    expect([out[0], out[1]]).toEqual([0xff, 0xd8]); // still a JPEG
    expect(contains(out, ASCII('Exif'))).toBe(false); // EXIF gone
    expect(contains(out, ASCII('JFIF'))).toBe(true); // JFIF kept
    expect(contains(out, [0xaa, 0xbb, 0xcc])).toBe(true); // scan kept
    expect([out[out.length - 2], out[out.length - 1]]).toEqual([0xff, 0xd9]); // EOI kept
    expect(out.length).toBeLessThan(jpegWithExif().length);
  });

  it('is a no-op for a JPEG without metadata', () => {
    const clean = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x01, 0x10, 0x20, 0xff, 0xd9]);
    expect(Array.from(stripJpegMetadata(clean))).toEqual(Array.from(clean));
  });

  it('returns non-JPEG input unchanged', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
    expect(stripJpegMetadata(png)).toBe(png);
  });
});

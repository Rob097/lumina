/**
 * Server-side metadata strip (HARD RULE #9, defense-in-depth). The widget already re-encodes through a
 * canvas to drop EXIF/GPS (D24); this strips again on the server path for JPEGs by dropping the APP1
 * (EXIF/XMP) … APP15 and COM segments while preserving JFIF (APP0), the frame, and the scan. Pure, no
 * native deps. Non-JPEG input (already-clean WebP/PNG from the widget) is returned untouched.
 */
/** Best-effort content type from an object key's extension (for re-storing a sanitized image). */
export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    return input; // not a JPEG — nothing to do here
  }

  const out: number[] = [0xff, 0xd8]; // SOI
  let i = 2;

  while (i < input.length) {
    if (input[i] !== 0xff) {
      // Misaligned (shouldn't happen in valid JPEGs) — copy the remainder verbatim and stop.
      for (let j = i; j < input.length; j++) out.push(input[j]!);
      break;
    }
    // Skip any 0xFF fill bytes to reach the marker code.
    let m = i + 1;
    while (m < input.length && input[m] === 0xff) m++;
    const marker = input[m];
    if (marker === undefined) break;

    // Start of scan: copy the SOS marker and all compressed data to EOF verbatim.
    if (marker === 0xda) {
      for (let j = m - 1; j < input.length; j++) out.push(input[j]!);
      break;
    }
    // Standalone markers (no length payload): EOI / RSTn.
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      i = m + 1;
      continue;
    }

    // Length-bearing segment (length is big-endian and includes its own 2 bytes).
    const segLen = (input[m + 1]! << 8) | input[m + 2]!;
    const segEnd = m + 1 + segLen;
    const strip = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe; // APP1–APP15 + COM
    if (!strip) {
      out.push(0xff, marker);
      for (let j = m + 1; j < segEnd; j++) out.push(input[j]!);
    }
    i = segEnd;
  }

  return Uint8Array.from(out);
}

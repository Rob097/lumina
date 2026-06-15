import sharp from 'sharp';

/**
 * Pixel-perfect composite (#AI-gen v2). Blends the inpainted EDITED image over the ORIGINAL room photo
 * using a grayscale MASK (white = use edited, black = keep original). Done as an explicit per-pixel
 * raw blend so the guarantee is literal: where the mask is 0 the output byte equals the original byte —
 * the uploaded scene is preserved exactly outside the edited region (no re-framing/rotation/drift).
 */
export async function compositeOverOriginal(opts: {
  original: Uint8Array;
  edited: Uint8Array;
  mask: Uint8Array;
  contentType?: string;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
  const wantPng = (opts.contentType ?? '').includes('png');
  const fallback = (): { bytes: Uint8Array; contentType: string } => ({
    bytes: opts.edited,
    contentType: opts.contentType ?? 'image/jpeg',
  });

  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(Buffer.from(opts.original)).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return fallback();
  }
  if (width <= 0 || height <= 0) {
    return fallback();
  }

  const toRgb = (bytes: Uint8Array): Promise<Buffer> =>
    sharp(Buffer.from(bytes)).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();

  const [o, e, m] = await Promise.all([
    toRgb(opts.original),
    toRgb(opts.edited),
    sharp(Buffer.from(opts.mask)).resize(width, height, { fit: 'fill' }).toColourspace('b-w').raw().toBuffer(),
  ]);

  const out = Buffer.allocUnsafe(width * height * 3);
  for (let i = 0, p = 0; i < width * height; i += 1, p += 3) {
    const a = m[i]! / 255;
    const inv = 1 - a;
    out[p] = Math.round(e[p]! * a + o[p]! * inv);
    out[p + 1] = Math.round(e[p + 1]! * a + o[p + 1]! * inv);
    out[p + 2] = Math.round(e[p + 2]! * a + o[p + 2]! * inv);
  }

  const img = sharp(out, { raw: { width, height, channels: 3 } });
  const bytes = wantPng ? await img.png().toBuffer() : await img.jpeg({ quality: 92 }).toBuffer();
  return { bytes: new Uint8Array(bytes), contentType: wantPng ? 'image/png' : 'image/jpeg' };
}

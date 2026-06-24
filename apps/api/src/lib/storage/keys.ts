import { randomUUID } from 'node:crypto';

/**
 * R2 object keys — ALWAYS prefixed by `{merchant_id}/` within a role folder so signed URLs can never
 * cross tenants (CLAUDE.md HARD RULE #1).
 */
export function roomKey(merchantId: string, id: string = randomUUID()): string {
  return `rooms/${merchantId}/${id}.jpg`;
}

export function productKey(merchantId: string, id: string): string {
  return `products/${merchantId}/${id}.png`;
}

export function resultKey(merchantId: string, generationId: string): string {
  return `results/${merchantId}/${generationId}.jpg`;
}

/**
 * Small long-lived WebP preview of a result (retention §9). Tenant-prefixed (HARD RULE #1). Kept after
 * the full-resolution originals are purged so the dashboard gallery still shows a visual.
 */
export function thumbKey(merchantId: string, generationId: string): string {
  return `thumbs/${merchantId}/${generationId}.webp`;
}

/** Allowed image types for a merchant-uploaded guide image, mapped to their file extension. */
const GUIDE_IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

/** The file extension for a supported guide image content type, or null if unsupported. */
export function guideImageExt(contentType: string): string | null {
  return GUIDE_IMAGE_EXT[contentType.toLowerCase().trim()] ?? null;
}

/** The image content type for a stored guide file extension, or null if unsupported. */
export function guideImageContentType(ext: string): string | null {
  const e = ext.toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'webp') return 'image/webp';
  return null;
}

/**
 * R2 key for a merchant's pre-upload guide image. Tenant-prefixed (HARD RULE #1). The file name is
 * `{id}.{ext}` so the public guide proxy route can re-derive the content type from the extension.
 */
export function guideKey(merchantId: string, id: string, ext: string): string {
  return `guides/${merchantId}/${id}.${ext}`;
}

/** Extract the merchant id a key belongs to (defense-in-depth check). */
export function merchantIdForKey(key: string): string | null {
  const match = /^(?:rooms|products|results|guides|thumbs)\/([^/]+)\//.exec(key);
  return match ? match[1]! : null;
}

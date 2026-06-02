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

/** Extract the merchant id a key belongs to (defense-in-depth check). */
export function merchantIdForKey(key: string): string | null {
  const match = /^(?:rooms|products|results)\/([^/]+)\//.exec(key);
  return match ? match[1]! : null;
}

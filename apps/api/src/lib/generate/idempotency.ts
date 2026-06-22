import { createHash } from 'node:crypto';
import type { InlineProduct } from '@lumina/shared';

/** Stable reference for an inline product (used in the idempotency key). */
export function inlineProductRef(product: InlineProduct): string {
  return createHash('sha256')
    .update([product.name, product.imageUrl, product.category ?? 'other'].join('|'))
    .digest('hex')
    .slice(0, 24);
}

/** Stable short hash of a freehand annotation (F3), folded into the idempotency key so a re-draw re-renders. */
export function annotationRef(annotation: unknown): string {
  return createHash('sha256').update(JSON.stringify(annotation)).digest('hex').slice(0, 24);
}

/**
 * Idempotency key for a generation (§4 step 15): identical (merchant, product, room, hint) inputs map
 * to the same key, enforced by `gen_idem_uidx` so duplicates never create a second paid job. The optional
 * annotation segment is appended ONLY when present, so un-annotated requests keep their existing keys.
 */
export function computeIdempotencyKey(parts: {
  merchantId: string;
  productRef: string;
  roomKey: string;
  placementHint?: string;
  customInstructions?: string;
  annotationHash?: string;
}): string {
  const segments = [
    parts.merchantId,
    parts.productRef,
    parts.roomKey,
    parts.placementHint ?? '',
    parts.customInstructions ?? '',
  ];
  if (parts.annotationHash) {
    segments.push(parts.annotationHash);
  }
  return createHash('sha256').update(segments.join('|')).digest('hex');
}

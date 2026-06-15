import type { QuantityInput } from '../types.js';

/**
 * QUANTITY — coverage-estimate prompt (editable).
 *
 * The vision model sees the room photo and reasons about how many units of the product (at its real
 * size) are needed to cover the relevant surface for its category. The category gating + clamping live
 * in `../quantity.ts`; only the prompt text lives here so it sits next to the other editable prompts.
 */

function describeDimensions(input: QuantityInput): string {
  const d = input.dimensions;
  if (!d || (d.w == null && d.h == null && d.d == null)) {
    return 'Product dimensions are unknown — estimate conservatively and lower your confidence.';
  }
  const unit = d.unit ?? 'cm';
  const parts = [
    d.w != null ? `width ${d.w}${unit}` : null,
    d.h != null ? `height ${d.h}${unit}` : null,
    d.d != null ? `depth ${d.d}${unit}` : null,
  ].filter(Boolean);
  return `One unit measures ${parts.join(' × ')}.`;
}

export function buildQuantityPrompt(input: QuantityInput): string {
  const name = input.productName ? `"${input.productName}"` : 'the product';
  const placement = input.placementHint ? ` The shopper wants it ${input.placementHint}.` : '';
  return [
    `You estimate how many units of a ${input.category} product (${name}) a shopper needs to cover the`,
    `relevant surface in the room shown.${placement}`,
    describeDimensions(input),
    'Look at the room photo, gauge the target surface (wall, floor or area), and return how many units',
    'cover it as a practical buying quantity (round up to whole units, account for typical waste).',
    'Return strict JSON: suggestedQuantity (integer ≥ 1), unit (what is counted, e.g. "panels"),',
    'rationale (one short sentence a shopper understands), confidence (0..1, lower when unsure or when',
    'product dimensions are missing).',
  ].join(' ');
}

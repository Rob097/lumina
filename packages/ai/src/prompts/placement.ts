import type { PlacementDetectorInput } from '../types.js';

/**
 * PLACEMENT DETECTOR prompt — a cheap vision pass over the SUBJECT photo (first image) + the PRODUCT (second).
 * It returns a {@link FashionPlacement} so we can size + position the product DETERMINISTICALLY (the generative
 * image model ignores both). It does NOT generate an image: it only locates where the product should go and a
 * body-scale reference. Generic across fashion items — the carry point depends on the product type.
 */
export function buildPlacementPrompt(input: PlacementDetectorInput): string {
  const category = input.category ? ` (merchant category hint: ${input.category})` : '';
  return [
    'You are a vision analyst for a fashion try-on. You do NOT generate images — you only LOCATE where a',
    'product should be placed on a person and report measurements as JSON.',
    '',
    'INPUTS: the FIRST image is the PERSON (the subject, often a mirror selfie). The SECOND image is the',
    `PRODUCT to be worn or carried${category}.`,
    '',
    'TASK: decide where THIS product attaches to the person and return these fields:',
    '- carry: where this KIND of item is worn/carried — one of hand, forearm, wrist, shoulder, neck, ears,',
    '  face, head, body. (earrings → ears; necklace → neck; glasses → face; hat → head; bag → hand or forearm;',
    '  watch/bracelet → wrist; garment → body.)',
    '- armSide: for a hand/forearm/wrist carry, which of the subject\'s arms carries it, as YOU SEE IT in the',
    '  image — "left" (left side of the image) or "right" (right side of the image). Prefer the arm the subject',
    '  has clearly PREPARED to receive it (a raised or curled hand, or a forearm held out ready); else the arm',
    '  NOT holding the phone. Use "none" for non-arm carries (ears, face, head, neck, body).',
    '- anchor: the exact point where the product attaches, as NORMALIZED image coordinates — x from the LEFT',
    '  edge (0) to the RIGHT edge (1), y from the TOP edge (0) to the BOTTOM edge (1). For a bag this is the',
    "  hand/wrist it hangs from; for earrings the earlobe; for glasses the bridge of the nose; etc.",
    '- shoulderWidthNorm: the width of the subject\'s shoulders (left shoulder to right shoulder) as a fraction',
    '  of the image width (a number between 0 and 1). Estimate it even if the shoulders are partly out of frame.',
    '- found: true if you could determine a sensible placement, false otherwise.',
    '',
    'Be precise with the coordinates — they will be used to place the product exactly. Report ONLY the JSON.',
  ].join('\n');
}

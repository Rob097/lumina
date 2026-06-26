import type { PlacementDetectorInput } from '../types.js';

/**
 * PLACEMENT DETECTOR prompt — a cheap vision pass over the SUBJECT photo (first image) + the PRODUCT (second).
 * It returns a {@link FashionPlacement} so we can size + position the product DETERMINISTICALLY (the generative
 * image model ignores both). It does NOT generate an image. Framed as concrete OBJECT DETECTION (locate the
 * actual body parts with bounding boxes) — far more reliable than guessing an abstract point. Generic across
 * product types: the parts to locate depend on the product.
 */
export function buildPlacementPrompt(input: PlacementDetectorInput): string {
  const category = input.category ? ` (merchant category hint: ${input.category})` : '';
  return [
    'You are a precise vision DETECTOR for a fashion try-on. You do NOT generate images — you LOCATE body',
    'parts and report bounding boxes + points as JSON.',
    '',
    'INPUTS: the FIRST image is the PERSON (the subject, usually a mirror selfie). The SECOND image is the',
    `PRODUCT to be worn or carried${category}.`,
    '',
    'COORDINATES: all values are fractions of the image — x from the LEFT edge (0.0) to the RIGHT edge (1.0),',
    'y from the TOP edge (0.0) to the BOTTOM edge (1.0). A bounding box is {x, y, w, h} where x,y is the',
    'TOP-LEFT corner and w,h the width/height as fractions. Look carefully at the actual pixels and be precise.',
    '',
    'STEP 1 — DETECT (fill `parts`): find the relevant body parts and give each a tight bounding box:',
    '- For a bag / watch / bracelet (carried on an arm): detect BOTH hands you can see — label them',
    '  "left hand" and "right hand" (left = on the LEFT side of the image, right = on the RIGHT side). Include',
    '  the wrist if visible.',
    '- For earrings: detect the visible ear(s) ("left ear", "right ear"). For glasses: the face/eyes. For a',
    '  hat: the top of the head. For a necklace/scarf: the neck. Only include parts you can actually see.',
    'Also estimate the shoulders to set `shoulderWidthNorm` (left-shoulder-to-right-shoulder width as a',
    'fraction of image width), even if partly out of frame.',
    '',
    'STEP 2 — CHOOSE (set `carry`, `armSide`, `anchor`):',
    '- carry: where THIS product is worn/carried — one of hand, forearm, wrist, shoulder, neck, ears, face,',
    '  head, body.',
    '- For an arm-carried product, pick the arm the subject has clearly PREPARED to receive it (a raised or',
    '  curled hand, or a forearm held out ready); else the arm NOT holding the phone. Set `armSide` to that',
    '  side. Set `anchor` to the CENTRE of THAT hand/wrist box (the exact point the product hangs from). It',
    '  MUST sit inside that detected hand box — do NOT return the centre of the body.',
    '- For ears/face/head/neck, set `armSide` to "none" and `anchor` to the exact attach point (earlobe, nose',
    '  bridge, crown, base of the neck).',
    '',
    'Set `found` false only if the subject or the needed part is not visible. Report ONLY the JSON. Double-check',
    'that `anchor` falls on the chosen part in the image before answering.',
  ].join('\n');
}

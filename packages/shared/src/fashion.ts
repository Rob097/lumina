import { z } from 'zod';

/**
 * Where a fashion product attaches to the body. Generic across product types so the deterministic placement
 * works for any fashion item, not just bags (earrings → ears, glasses → face, a bag → the hand, etc.).
 */
export const FashionCarrySchema = z.enum([
  'hand',
  'forearm',
  'wrist',
  'shoulder',
  'neck',
  'ears',
  'face',
  'head',
  'body',
]);
export type FashionCarry = z.infer<typeof FashionCarrySchema>;

/**
 * Deterministic placement target for a fashion try-on, detected by a cheap vision pass over the SUBJECT photo
 * (no image generation). All coordinates and lengths are NORMALIZED to the image (0..1), so they are
 * resolution-independent. The geometry step turns this + the product's real-world dimensions into an exact
 * pixel box — which is how we control size and position deterministically (the generative model ignores both).
 */
export const FashionPlacementSchema = z.object({
  /** Whether a usable placement was located. When false, the workflow falls back to the plain generative path. */
  found: z.boolean(),
  /** How/where the product is worn or carried (drives the anchor's meaning). */
  carry: FashionCarrySchema,
  /** Image side of the chosen arm (for hand/forearm carries) — for logging + the debug overlay. */
  armSide: z.enum(['left', 'right', 'none']),
  /** The point on the body where the product's reference attaches (e.g. the hand a bag hangs from). */
  anchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  /**
   * The subject's shoulder width as a fraction of the image width — a robust body-scale reference. Real adult
   * shoulders are ~40 cm, so this fixes pixels-per-cm and lets us size the product from its real dimensions.
   */
  shoulderWidthNorm: z.number().min(0).max(2),
});
export type FashionPlacement = z.infer<typeof FashionPlacementSchema>;

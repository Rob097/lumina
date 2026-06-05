import type { ProductCategory } from '@lumina/shared';
import type { ImageRef } from './types.js';

/**
 * Input/output moderation (§7.4 steps 1 & 5, HARD RULE #9). The *policy* is pure and tested here;
 * the actual classifier (a vision model / provider safety filter) lives behind `ModerationProvider`
 * and only produces the signals. We reject non-interior rooms and face-dominant photos for non-fashion
 * categories, and any unsafe content — and a terminal reject refunds the credit upstream.
 */
export type ModerationReason = 'unsafe' | 'not_interior' | 'face_dominant' | 'corrupt';
export type ModerationVerdict = { ok: true } | { ok: false; reason: ModerationReason };

/** Classifier outputs in [0,1] for a single image. */
export interface ImageSignals {
  /** Probability the photo depicts an interior/space. */
  interiorScore: number;
  /** Fraction of the frame occupied by faces. */
  faceAreaRatio: number;
  /** Unsafe-content probability. */
  nsfwScore: number;
}

export interface ModerationThresholds {
  minInterior: number;
  maxFaceRatioNonFashion: number;
  maxNsfw: number;
}

export const DEFAULT_MODERATION_THRESHOLDS: ModerationThresholds = {
  minInterior: 0.5,
  maxFaceRatioNonFashion: 0.25,
  maxNsfw: 0.7,
};

/** Categories where people/faces are expected (and thus allowed to dominate the frame). */
const FACE_OK_CATEGORIES = new Set<ProductCategory>(['fashion']);

export function classifyInput(
  signals: ImageSignals,
  category: ProductCategory,
  thresholds: ModerationThresholds = DEFAULT_MODERATION_THRESHOLDS,
): ModerationVerdict {
  if (signals.nsfwScore >= thresholds.maxNsfw) {
    return { ok: false, reason: 'unsafe' };
  }
  if (signals.interiorScore < thresholds.minInterior && !FACE_OK_CATEGORIES.has(category)) {
    return { ok: false, reason: 'not_interior' };
  }
  if (!FACE_OK_CATEGORIES.has(category) && signals.faceAreaRatio > thresholds.maxFaceRatioNonFashion) {
    return { ok: false, reason: 'face_dominant' };
  }
  return { ok: true };
}

export function classifyOutput(
  signals: ImageSignals,
  thresholds: ModerationThresholds = DEFAULT_MODERATION_THRESHOLDS,
): ModerationVerdict {
  if (signals.nsfwScore >= thresholds.maxNsfw) {
    return { ok: false, reason: 'unsafe' };
  }
  return { ok: true };
}

export interface ModerationInput {
  room: ImageRef;
  product?: ImageRef;
  category: ProductCategory;
}

/** Classifier seam (swap mock ↔ fal/vision in one place, mirrors `AIProvider`, HARD RULE #8). */
export interface ModerationProvider {
  moderateInput(input: ModerationInput): Promise<ModerationVerdict>;
  moderateOutput(image: ImageRef, category: ProductCategory): Promise<ModerationVerdict>;
}

/** Deterministic pass-through used by local dev, e2e, and tests (always-safe signals). */
export class MockModerationProvider implements ModerationProvider {
  async moderateInput(): Promise<ModerationVerdict> {
    return { ok: true };
  }
  async moderateOutput(): Promise<ModerationVerdict> {
    return { ok: true };
  }
}

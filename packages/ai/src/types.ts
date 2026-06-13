import type { ProductCategory } from '@lumina/shared';

/** Cost/quality routing policy resolved per merchant + request (§7.2). */
export type RoutingPolicy = 'quality' | 'balanced' | 'fast';

/** An image passed to a provider — either a fetchable URL or raw bytes. */
export type ImageRef = { url: string } | { bytes: Uint8Array; contentType?: string };

/** Output of the fast scene-analysis pass (§7.4 step 3). */
export interface SceneAnalysis {
  lightDir: string;
  colorTempK: number;
  style: string;
  surfaces: string[];
}

export interface Dimensions {
  w?: number;
  h?: number;
  d?: number;
  unit?: 'cm' | 'in';
}

export interface ComposeInput {
  room: ImageRef;
  product: ImageRef;
  category: ProductCategory;
  placementHint?: string;
  /** Free-text shopper guidance, rendered as a soft preference that can't override the hard rules. */
  customInstructions?: string;
  dimensions?: Dimensions;
  scene?: SceneAnalysis;
  policy: RoutingPolicy;
  /** Long-edge pixels to generate at; defaults are env-configured per policy. */
  resolution?: number;
  watermark?: boolean;
}

/** What a provider returns from a single compose call. */
export interface ProviderResult {
  bytes: Uint8Array;
  contentType: string;
  /** Model identifier, e.g. 'nano-banana-pro' | 'flux2-edit'. */
  model: string;
  /** Our provider cost in cents (for margin analysis). */
  costCents: number;
  width?: number;
  height?: number;
}

/** Orchestrator result = provider result + measured latency. */
export interface ComposeResult extends ProviderResult {
  latencyMs: number;
}

/** The single model-call interface. Swapping fal ↔ vertex ↔ replicate is a one-file change. */
export interface AIProvider {
  readonly name: string;
  compose(input: ComposeInput, prompt: string): Promise<ProviderResult>;
}

export interface BgRemovalProvider {
  removeBackground(image: ImageRef): Promise<{ bytes: Uint8Array; contentType: string }>;
}

export interface SceneProvider {
  analyzeScene(image: ImageRef): Promise<SceneAnalysis>;
}

/** Input to the coverage-quantity estimator (§7 — "how many units to cover this surface"). */
export interface QuantityInput {
  room: ImageRef;
  category: ProductCategory;
  /** Real-world product size, used to reason about how many fit the target surface. */
  dimensions?: Dimensions;
  productName?: string;
  placementHint?: string;
}

/**
 * A coverage/quantity estimate. `isCoverage` is false for single-unit products (the estimate is a
 * trivial 1, no model call). For coverage products the model returns N + a short rationale.
 */
export interface QuantityEstimate {
  /** Integer ≥ 1. */
  suggestedQuantity: number;
  /** What's being counted, e.g. 'panels', 'tiles', 'boxes' (folded into the rationale for display). */
  unit: string;
  isCoverage: boolean;
  rationale: string;
  /** 0..1 — low-confidence coverage estimates are dropped by the caller, never shown. */
  confidence: number;
}

/**
 * Optional coverage-quantity estimator: a cheap text+vision pass behind the orchestrator. Swapping the
 * gateway ↔ another vision model stays a one-file change (HARD RULE #8).
 */
export interface QuantityProvider {
  readonly name: string;
  estimateQuantity(input: QuantityInput, prompt: string): Promise<QuantityEstimate>;
}

import type {
  GenerationMode,
  GenerationPlan,
  PlanRepetition,
  PlanTarget,
  ProductCategory,
  SceneAnalysis,
} from '@lumina/shared';

/**
 * The scene-analysis output (per-image facts) is the shared wire contract (`SceneAnalysisSchema`).
 * Re-exported so `@lumina/ai` consumers keep a single import surface (HARD RULE #6 — no duplicate types).
 */
export type { SceneAnalysis } from '@lumina/shared';

/** Cost/quality routing policy resolved per merchant + request (§7.2). */
export type RoutingPolicy = 'quality' | 'balanced' | 'fast';

/** An image passed to a provider — either a fetchable URL or raw bytes. */
export type ImageRef = { url: string } | { bytes: Uint8Array; contentType?: string };

/** Whether the uploaded photo is an indoor space or an outdoor scene (facade, entrance, garden). */
export type SceneType = 'interior' | 'exterior';

export interface Dimensions {
  w?: number;
  h?: number;
  d?: number;
  unit?: 'cm' | 'in';
}

/**
 * One product in a multi-product generation (F2), used to enumerate the products in the compose prompt.
 * The images themselves travel in {@link ComposeInput.products} (same order).
 */
export interface MultiProductInfo {
  name: string;
  category: ProductCategory;
  dimensions?: Dimensions;
  /** Optional per-product placement guidance (e.g. 'on the side table'). */
  placementHint?: string;
}

export interface ComposeInput {
  room: ImageRef;
  product: ImageRef;
  /**
   * Multi-product (F2): all product cutouts to place into the one scene, in order. When present with more
   * than one entry, the provider sends `[room, ...products]` and the prompt switches to multi-object
   * placement. `product` stays the primary (products[0]) so single-product callers are untouched.
   */
  products?: ImageRef[];
  /** Per-product facts for the multi-object prompt (same order as {@link products}). */
  productInfos?: MultiProductInfo[];
  category: ProductCategory;
  placementHint?: string;
  /** Free-text shopper guidance, rendered as a soft preference that can't override the hard rules. */
  customInstructions?: string;
  dimensions?: Dimensions;
  scene?: SceneAnalysis;
  /**
   * The operation to perform (Generation Engine v3 §4.2), from the planner. Drives the mode-specific
   * compose task; absent ⇒ `object_placement` (today's behaviour).
   */
  mode?: GenerationMode;
  /** The target surface/element the operation acts on (planner `target`). */
  target?: PlanTarget;
  /** How the product repeats over the target (planner `repetition`) — used by `surface_covering`. */
  repetition?: PlanRepetition;
  /** Indoor vs outdoor — adds exterior-aware guidance to the prompt (facades, gardens, entrances). */
  sceneType?: SceneType;
  /**
   * Freehand annotation (F3): the shopper burned translucent marks onto the room image. Surfaced to the
   * prompt by its color so the model treats the marked areas as guidance and does NOT keep the marks.
   * `region` is a coarse textual position ("right", "top-left", …) the server resolved from the strokes
   * for a single placement target, so the model honors the drawn location reliably (omitted for multi).
   */
  annotation?: { color: string; region?: string };
  /** Output aspect ratio pinned to the room photo (e.g. '4:3') so the model can't re-frame/rotate it. */
  aspectRatio?: string;
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

/**
 * Input to the planner (Generation Engine v3 §4.1): both images + the known product metadata. The planner
 * reasons over all of it to decide the *operation* (mode), target, repetition and scale — replacing the
 * separate scene-analysis pass (one call, not two).
 */
export interface PlannerInput {
  room: ImageRef;
  product: ImageRef;
  productName?: string;
  dimensions?: Dimensions;
  /** Merchant category — a soft hint only; the planner infers the operation per image. */
  category?: ProductCategory;
}

/**
 * The planner: a single cheap reasoning call returning a Zod-validated {@link GenerationPlan}. Swapping the
 * model/provider stays a one-file change behind this seam (HARD RULE #8).
 */
export interface PlannerProvider {
  plan(input: PlannerInput): Promise<GenerationPlan>;
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

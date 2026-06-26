import type {
  FashionPlacement,
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
  /**
   * A concise product description/analysis (from the planner) — a textual identity anchor injected into the
   * prompt so the model reconstructs the exact product even from a messy/in-context product photo.
   */
  productDescription?: string;
  /** Free-text shopper guidance, rendered as a soft preference that can't override the hard rules. */
  customInstructions?: string;
  /**
   * Optional merchant placement-guide image (the pre-upload guide, D88/D90), sent as the LAST image and used
   * ONLY as a positioning reference: where/how the product is placed and the intended pose/arrangement. Its
   * drawn figure/style is never copied, and the real subject/scene (the first image) is never altered.
   */
  placementDiagram?: ImageRef;
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
  /** Configured/estimated provider cost in cents — the fallback when the real cost isn't reported. */
  costCents: number;
  /**
   * The REAL cost of this call in USD millionths (micro-USD), read live from the gateway response
   * (`providerMetadata.gateway.cost`). Undefined when the provider didn't report it (mock/BYOK/offline),
   * in which case callers fall back to `costCents`. 1 cent = 10_000 micros.
   */
  costMicros?: number;
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

/** Input to the fashion placement detector: the subject photo + the product (so it knows the carry type). */
export interface PlacementDetectorInput {
  subject: ImageRef;
  product: ImageRef;
  /** Merchant category — a soft hint; the detector identifies the product and where it is worn/carried. */
  category?: ProductCategory;
}

/**
 * The fashion placement detector: a cheap vision pass over the SUBJECT photo returning a Zod-validated
 * {@link FashionPlacement} (where/how the product attaches + a body-scale reference). Used to control fashion
 * size + position deterministically. Swapping the model/provider stays a one-file change (HARD RULE #8).
 */
export interface PlacementDetectorProvider {
  detect(input: PlacementDetectorInput): Promise<FashionPlacement>;
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

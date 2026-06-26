import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  MockModerationProvider,
  computeProductBox,
  isFashionCategory,
  planToSceneAnalysis,
  resolvePolicy,
  resolvePolicyFashion,
  type AIOrchestrator,
  type ComposeResult,
  type ImageRef,
  type ModerationProvider,
  type ModerationReason,
  type QuantityEstimate,
} from '@lumina/ai';
import {
  generationAssets,
  generations,
  merchants,
  products,
  usageEvents,
  type Database,
  type ProductSnapshot,
} from '@lumina/db';
import {
  neutralGenerationPlan,
  type GenerationMode,
  type GenerationPlan,
  type ProductCategory,
} from '@lumina/shared';
import { resultKey as buildResultKey, thumbKey as buildThumbKey } from '../storage/keys.js';
import { makeThumbnail } from '../images/thumbnail.js';
import { contentTypeForKey } from '../images/exif.js';
import { autoOrientAndStrip } from '../images/orient.js';
import { nearestAspectRatio, readImageSize } from '../images/dimensions.js';
import { computeChangeMask, shouldComposite } from '../images/diff-mask.js';
import { compositeOverOriginal } from '../images/composite.js';
import { DEFAULT_DESKEW_MAX_DEGREES, normalizeRoom } from '../images/normalize.js';
import { generationEvent, type EventSink } from '../observability.js';
import { getWidgetSettings } from '../widget-config/service.js';
import { fetchRemoteImage } from '../net/safe-fetch.js';
import { drawPlacementOverlay } from '../images/overlay.js';
import type { NotifyInput } from '../notifications/service.js';

/** Minimal storage surface the workflow needs (satisfied by `R2Storage`). */
export interface StoragePort {
  getObject(key: string): Promise<Uint8Array>;
  presignDownload(key: string, expiresIn?: number): Promise<string>;
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

export interface WorkflowDeps {
  db: Database;
  orchestrator: AIOrchestrator;
  storage: StoragePort;
  /** Input/output safety filter (§7.4). Defaults to an always-safe mock (local/e2e). */
  moderation?: ModerationProvider;
  /** Ops/cost event sink (Axiom). Optional — no-op when unset. */
  events?: EventSink;
  reportError?: (err: unknown, context: Record<string, unknown>) => void;
  /** Emit a dashboard notification (e.g. on terminal failure). Optional — skipped when unset. */
  notify?: (input: NotifyInput) => Promise<void>;
}

export type ProcessOutcome = 'succeeded' | 'failed' | 'skipped';

type GenerationRow = typeof generations.$inferSelect;

/**
 * Tell the merchant a preview failed (and the credit was refunded). Best-effort: notification/email
 * problems must never change the workflow outcome, so failures here are swallowed (reported, not thrown).
 */
async function notifyGenerationFailed(
  deps: Pick<WorkflowDeps, 'notify' | 'reportError'>,
  gen: GenerationRow,
  errorCode: string,
): Promise<void> {
  if (!deps.notify) {
    return;
  }
  try {
    await deps.notify({
      merchantId: gen.merchantId,
      type: 'generation_failed',
      title: 'A preview couldn’t be generated',
      body: `We couldn’t create the preview for “${gen.productSnapshot.name}” and refunded the credit.`,
      data: { generationId: gen.id, errorCode },
    });
  } catch (err) {
    deps.reportError?.(err, { generationId: gen.id, merchantId: gen.merchantId });
  }
}

/** Map a moderation reason to a terminal generation error code. */
function moderationErrorCode(reason: ModerationReason): string {
  switch (reason) {
    case 'not_environment':
      return 'not_environment';
    case 'face_dominant':
      return 'face_dominant';
    case 'corrupt':
      return 'corrupt_image';
    case 'unsafe':
    default:
      return 'unsafe_content';
  }
}

function errorCodeFor(_err: unknown): string {
  return 'generation_failed';
}

/** Below this model confidence a coverage estimate is dropped (not shown in the dashboard). */
const QUANTITY_CONFIDENCE_MIN = 0.5;

/**
 * Best-effort coverage-quantity estimate (#7). Returns null (never throws) so a flaky vision call can never
 * fail an otherwise-successful generation. Informational only — the estimate is stored + surfaced in the
 * dashboard (D67); it never changes how the image is generated.
 */
async function estimateCoverageSafe(
  deps: WorkflowDeps,
  gen: GenerationRow,
  category: ProductCategory,
  roomUrl: string,
): Promise<QuantityEstimate | null> {
  try {
    return await deps.orchestrator.estimateQuantity({
      room: { url: roomUrl },
      category,
      dimensions: gen.productSnapshot.dimensions,
      productName: gen.productSnapshot.name,
      placementHint: gen.placementHint ?? undefined,
    });
  } catch (err) {
    deps.reportError?.(err, { generationId: gen.id, stage: 'estimate_quantity' });
    return null;
  }
}

/** The stored coverage fields — only a confident multi-unit coverage estimate is kept (else null). Pure. */
export function coverageStoreFields(
  est: QuantityEstimate | null,
): { suggestedQuantity: number | null; quantityRationale: string | null } {
  if (est && est.isCoverage && est.confidence >= QUANTITY_CONFIDENCE_MIN && est.suggestedQuantity > 1) {
    return { suggestedQuantity: est.suggestedQuantity, quantityRationale: est.rationale };
  }
  return { suggestedQuantity: null, quantityRationale: null };
}

// Change-detection knobs (tunable per env in S5 from the golden-set eval).
const CHANGE_THRESHOLD = Number(process.env.CHANGE_MASK_THRESHOLD ?? 28);
const CHANGE_FEATHER = Number(process.env.CHANGE_MASK_FEATHER ?? 6);
const CHANGE_MIN_FRACTION = Number(process.env.CHANGE_MIN_FRACTION ?? 0.002);
const CHANGE_MAX_FRACTION = Number(process.env.CHANGE_MAX_FRACTION ?? 0.6);
// Several distinct products legitimately change more of the scene than one object, so the localized-change
// guard is looser for multi-product renders (F2) before it bails to the full model output.
const CHANGE_MAX_FRACTION_MULTI = Number(process.env.CHANGE_MAX_FRACTION_MULTI ?? 0.85);
// The fashion/person path is a localized change (an accessory at the hand + its contact shadow). Keep the
// mask path engaged for a normal placement — which guarantees the shopper's face/identity and background are
// the ORIGINAL pixels (a quality + privacy win) — while a pathological full-image repaint still bails out.
const CHANGE_MAX_FRACTION_FASHION = Number(process.env.CHANGE_MAX_FRACTION_FASHION ?? 0.5);
// A fashion accessory often matches the color of what it covers (a white bag over a white dress), so a low
// diff there would drop those pixels and make the product look see-through. Use a lower change threshold on
// the fashion path (plus hole-filling, below) so the product silhouette is captured solidly.
const CHANGE_THRESHOLD_FASHION = Number(process.env.CHANGE_MASK_THRESHOLD_FASHION ?? 14);
// Fashion routing: paid plans default to the QUALITY model — it renders the product at a realistic size and
// avoids malformations far better than fast (proven on Relievum), which matters more here than the small extra
// latency/cost. `free` stays fast (watermarked). Set FASHION_QUALITY_TIER=false to force fast store-wide.
const FASHION_QUALITY_TIER = (process.env.FASHION_QUALITY_TIER ?? 'true').toLowerCase() !== 'false';

// Room-normalization knobs (Phase 3 / D65) — code defaults so they work unset.
const DESKEW_MAX_DEGREES = Number(process.env.DESKEW_MAX_DEGREES ?? DEFAULT_DESKEW_MAX_DEGREES);
const AUTOLEVEL_ENABLED = (process.env.AUTOLEVEL_ENABLED ?? 'true').toLowerCase() !== 'false';

/**
 * Keep only the region the model actually changed (the product + its shadows) and composite it back over
 * the ORIGINAL, so the rest of the scene is byte-identical to the upload. Falls back to the full model
 * output when the detected change is implausibly small/large or the images can't be read. Never throws.
 */
async function keepOnlyProductChange(
  original: Uint8Array,
  composed: { bytes: Uint8Array; contentType: string },
  opts: { maxFraction?: number; threshold?: number; fillHoles?: boolean } = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  try {
    const change = await computeChangeMask(original, composed.bytes, {
      threshold: opts.threshold ?? CHANGE_THRESHOLD,
      feather: CHANGE_FEATHER,
      fillHoles: opts.fillHoles ?? false,
    });
    if (
      !shouldComposite(change.changedFraction, {
        minFraction: CHANGE_MIN_FRACTION,
        maxFraction: opts.maxFraction ?? CHANGE_MAX_FRACTION,
      })
    ) {
      return { bytes: composed.bytes, contentType: composed.contentType };
    }
    return await compositeOverOriginal({
      original,
      edited: composed.bytes,
      mask: change.mask,
      contentType: composed.contentType,
    });
  } catch {
    return { bytes: composed.bytes, contentType: composed.contentType };
  }
}

/** R2 key for a product's cached background-removed cutout (tenant-prefixed, HARD RULE #1). */
export function productCleanKey(merchantId: string, id: string): string {
  return `products/${merchantId}/clean/${id}.png`;
}

/**
 * Resolve one product image to compose with (Phase 1 / D63). Prefer a cached cutout
 * (`products.clean_image_key`); else compute one best-effort via the orchestrator's matting provider,
 * cache it on the catalog product (so the next generation skips the call), and use it. A matting cutout
 * preserves the product's exact pixels. Any failure — or no provider configured — degrades to the raw
 * product image; the cutout never fails or bills a generation. The product is addressed explicitly (by its
 * catalog id + image url) so the same logic serves the single- and multi-product (F2) paths.
 */
async function resolveProductImageFor(
  deps: WorkflowDeps,
  gen: Pick<GenerationRow, 'merchantId' | 'id'>,
  product: { productId?: string; imageUrl: string },
): Promise<ImageRef> {
  const rawUrl = product.imageUrl;
  if (product.productId) {
    const rows = await deps.db
      .select({ cleanImageKey: products.cleanImageKey })
      .from(products)
      .where(eq(products.id, product.productId))
      .limit(1);
    const cleanKey = rows[0]?.cleanImageKey;
    if (cleanKey) {
      return { url: await deps.storage.presignDownload(cleanKey) };
    }
  }
  try {
    const cutout = await deps.orchestrator.bgRemoval({ url: rawUrl });
    if (cutout) {
      const key = productCleanKey(gen.merchantId, product.productId ?? gen.id);
      await deps.storage.putObject(key, cutout.bytes, cutout.contentType);
      if (product.productId) {
        await deps.db
          .update(products)
          .set({ cleanImageKey: key })
          .where(and(eq(products.id, product.productId), eq(products.merchantId, gen.merchantId)));
      }
      return { url: await deps.storage.presignDownload(key) };
    }
  } catch (err) {
    deps.reportError?.(err, { generationId: gen.id, stage: 'bg_removal' });
  }
  return { url: rawUrl };
}

/**
 * Resolve every product image for the generation. `surface_covering` passes the ORIGINAL product texture
 * (the model needs the repeating pattern; single-product only, §4.3). Otherwise each product gets a cached
 * cutout — one for a single product (keyed by the row's `productId`), or one per product for a multi-product
 * render (F2), each keyed by its own catalog id so cutouts are cached + reused independently.
 */
async function resolveProductImages(
  deps: WorkflowDeps,
  gen: GenerationRow,
  productList: ProductSnapshot[],
  mode: GenerationMode,
): Promise<ImageRef[]> {
  if (mode === 'surface_covering') {
    return [{ url: gen.productSnapshot.imageUrl }];
  }
  if (productList.length <= 1) {
    return [
      await resolveProductImageFor(deps, gen, {
        ...(gen.productId ? { productId: gen.productId } : {}),
        imageUrl: gen.productSnapshot.imageUrl,
      }),
    ];
  }
  return Promise.all(
    productList.map((p) =>
      resolveProductImageFor(deps, gen, { ...(p.id ? { productId: p.id } : {}), imageUrl: p.imageUrl }),
    ),
  );
}

/**
 * The planner (§4.1): one cheap reasoning pass over BOTH images + product metadata that decides the
 * operation (covering / replacement / placement), the target, repetition and scale, and carries the
 * per-image facts (lighting, surfaces, tilt, quality) the compositor uses. Evolves and replaces the
 * separate scene pass — one call, not two. Best-effort: a missing provider, an error, or no result falls
 * back to a neutral `object_placement` plan (today's behaviour), so the planner never fails or bills a
 * generation. Runs in parallel with the product cutout.
 */
async function planSafe(deps: WorkflowDeps, gen: GenerationRow, roomUrl: string): Promise<GenerationPlan> {
  try {
    const plan = await deps.orchestrator.plan({
      room: { url: roomUrl },
      product: { url: gen.productSnapshot.imageUrl },
      productName: gen.productSnapshot.name,
      dimensions: gen.productSnapshot.dimensions,
      category: gen.productSnapshot.category as ProductCategory,
    });
    return plan ?? neutralGenerationPlan();
  } catch (err) {
    deps.reportError?.(err, { generationId: gen.id, stage: 'planner' });
    return neutralGenerationPlan();
  }
}

interface SuccessFields {
  generationId: string;
  merchantId: string;
  resultKey: string;
  /** Long-lived WebP preview key (retention §9). Null when thumbnail generation failed (best-effort). */
  thumbKey?: string | null;
  model: string;
  costCents: number;
  /** Real cost in USD millionths (micro-USD) from the gateway; null when only the estimate is known. */
  costMicros?: number | null;
  latencyMs: number;
  width?: number;
  height?: number;
  /** AI coverage estimate (#7) — null for single-unit products / low-confidence / no estimate. */
  suggestedQuantity?: number | null;
  quantityRationale?: string | null;
}

/** Persist a successful composite + its asset + a usage event (one transaction). */
export async function finalizeSuccess(db: Database, p: SuccessFields): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(generations)
      .set({
        status: 'succeeded',
        resultKey: p.resultKey,
        thumbKey: p.thumbKey ?? null,
        model: p.model,
        costCents: p.costCents,
        costMicros: p.costMicros ?? null,
        latencyMs: p.latencyMs,
        suggestedQuantity: p.suggestedQuantity ?? null,
        quantityRationale: p.quantityRationale ?? null,
        finishedAt: new Date(),
      })
      .where(eq(generations.id, p.generationId));
    await tx.insert(generationAssets).values({
      generationId: p.generationId,
      role: 'result',
      storageKey: p.resultKey,
      width: p.width,
      height: p.height,
    });
    if (p.thumbKey) {
      await tx.insert(generationAssets).values({
        generationId: p.generationId,
        role: 'thumb',
        storageKey: p.thumbKey,
      });
    }
    await tx
      .insert(usageEvents)
      .values({ merchantId: p.merchantId, type: 'success', generationId: p.generationId });
  });
}

/**
 * Terminal failure: mark failed + refund the credit (never bill a failed generation, HARD RULE #3).
 *
 * Idempotent by construction: the status flip is conditional on the row still being `queued`/`processing`,
 * and the refund only fires when that flip actually changed a row. `grant_credits()` is *not* itself
 * idempotent, so this guard is what prevents a double-refund when both a retry's catch and the Inngest
 * `onFailure` net (or two retries) reach the same generation. Returns whether it transitioned the row.
 */
export async function refundAndFail(
  db: Database,
  p: { generationId: string; merchantId: string; creditsSpent: number; errorCode: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const transitioned = await tx
      .update(generations)
      .set({ status: 'failed', errorCode: p.errorCode, finishedAt: new Date() })
      .where(
        and(eq(generations.id, p.generationId), inArray(generations.status, ['queued', 'processing'])),
      )
      .returning({ id: generations.id });
    if (transitioned.length === 0) {
      return false; // already terminal — don't refund again
    }
    await tx.execute(
      sql`select grant_credits(${p.merchantId}::uuid, ${p.creditsSpent}, 'refund', ${p.generationId})`,
    );
    return true;
  });
}

/**
 * The Inngest `onFailure` net (§4 Phase E): mark a generation failed + refund when a run dies *outside*
 * `processGeneration`'s own try/catch — a module-load crash, an OOM, or a function timeout — i.e. the
 * failure mode that previously left the row stuck in QUEUED. Idempotent (no-ops on an already-terminal
 * row, so it never double-refunds). Best-effort notify/event only when it actually transitions the row.
 */
export async function markFailed(
  deps: Pick<WorkflowDeps, 'db' | 'events' | 'reportError' | 'notify'>,
  generationId: string,
  errorCode: string,
): Promise<ProcessOutcome> {
  const rows = await deps.db
    .select()
    .from(generations)
    .where(eq(generations.id, generationId))
    .limit(1);
  const gen = rows[0];
  if (!gen) {
    return 'skipped';
  }
  const transitioned = await refundAndFail(deps.db, {
    generationId,
    merchantId: gen.merchantId,
    creditsSpent: gen.creditsSpent,
    errorCode,
  });
  if (!transitioned) {
    return 'skipped'; // already finished (success or an earlier failure) — leave it alone
  }
  await notifyGenerationFailed(deps, gen, errorCode);
  deps.events?.track(
    generationEvent({ generationId, merchantId: gen.merchantId, status: 'failed', creditsSpent: gen.creditsSpent, errorCode }),
  );
  return 'failed';
}

/**
 * Best-effort fetch of THIS merchant's pre-upload guide image (D88/D90) to hand the model as a positioning
 * REFERENCE only (never copied; the real subject/scene stays the first image — see `placementReference` in the
 * prompt). The guide CONFIG read is tenant-scoped by `merchantId` (HARD RULE #1); the image URL itself is
 * merchant-controlled free text, so it is fetched through the SSRF-hardened {@link fetchRemoteImage} (https +
 * public-host + no-redirect + size/content-type guards). Any miss / block / slow / broken URL simply yields
 * no diagram — it can never fail or stall a generation.
 */
async function resolveGuideDiagram(
  deps: WorkflowDeps,
  merchantId: string,
  generationId: string,
): Promise<ImageRef | undefined> {
  try {
    const { guide } = await getWidgetSettings(deps.db, merchantId);
    if (!guide?.enabled || !guide.imageUrl) {
      return undefined;
    }
    const img = await fetchRemoteImage(guide.imageUrl);
    return img ? { bytes: img.bytes, contentType: img.contentType } : undefined;
  } catch (err) {
    deps.reportError?.(err, { generationId, stage: 'guide_fetch' });
    return undefined;
  }
}

/** True when fashion placement DEBUG mode is on — the result is the detector's overlay, not a generation. */
function placementDebugEnabled(): boolean {
  return (process.env.FASHION_PLACEMENT_DEBUG ?? '').toLowerCase() === 'true';
}

/**
 * Placement-detector DEBUG result (behind `FASHION_PLACEMENT_DEBUG`): run the cheap vision detector, compute
 * the deterministic product box, and draw it as an overlay on the subject photo so the owner can VISUALLY
 * validate detection accuracy without an image generation. Returns a ComposeResult-shaped object so the rest
 * of the pipeline (store/finalize) is unchanged. Never throws — falls back to a labelled overlay.
 */
async function buildPlacementDebugResult(
  deps: WorkflowDeps,
  detInput: { subject: ImageRef; product: ImageRef; category: ProductCategory },
  baseImage: Uint8Array,
  dimensions: ProductSnapshot['dimensions'],
  size: { width: number; height: number },
): Promise<ComposeResult> {
  const placement = await deps.orchestrator.detectPlacement(detInput).catch(() => null);
  let overlay: { bytes: Uint8Array; contentType: string };
  if (placement?.found) {
    const box = computeProductBox(placement, dimensions, size.width, size.height);
    // Convert the detector's normalized part boxes (e.g. the hands) to pixels so we can see what it localized.
    const parts = (placement.parts ?? []).map((p) => ({
      label: p.label,
      box: {
        left: Math.round(p.box.x * size.width),
        top: Math.round(p.box.y * size.height),
        width: Math.round(p.box.w * size.width),
        height: Math.round(p.box.h * size.height),
      },
    }));
    overlay = await drawPlacementOverlay(baseImage, box, {
      anchor: placement.anchor,
      parts,
      label: `${placement.carry}/${placement.armSide} box ${box.width}x${box.height}px anchor ${placement.anchor.x.toFixed(2)},${placement.anchor.y.toFixed(2)}`,
    });
  } else {
    overlay = await drawPlacementOverlay(
      baseImage,
      { left: 0, top: 0, width: 0, height: 0 },
      { label: placement ? 'NO PLACEMENT FOUND' : 'DETECTOR UNAVAILABLE' },
    );
  }
  return {
    bytes: overlay.bytes,
    contentType: overlay.contentType,
    model: 'placement-debug',
    costCents: 0,
    width: size.width,
    height: size.height,
    latencyMs: 0,
  };
}

/**
 * The durable generation pipeline (§4 Phase E): processing → compose (via the orchestrator) → store →
 * finalize; any failure after the debit refunds the credit. Idempotent: a non-pending row is skipped.
 */
export async function processGeneration(
  deps: WorkflowDeps,
  generationId: string,
): Promise<ProcessOutcome> {
  const { db } = deps;
  const rows = await db.select().from(generations).where(eq(generations.id, generationId)).limit(1);
  const gen = rows[0];
  if (!gen) {
    return 'skipped';
  }
  if (gen.status !== 'queued' && gen.status !== 'processing') {
    return 'skipped';
  }

  try {
    // Inside the try so a failure here (e.g. the DB hiccupping on the status flip) still refunds + marks
    // failed via the catch, instead of escaping and leaving the row stuck in QUEUED.
    await db.update(generations).set({ status: 'processing' }).where(eq(generations.id, generationId));

    const merchantRows = await db
      .select({ plan: merchants.plan })
      .from(merchants)
      .where(eq(merchants.id, gen.merchantId))
      .limit(1);
    const plan = merchantRows[0]?.plan ?? 'free';

    const moderation = deps.moderation ?? new MockModerationProvider();

    // Sanitize on ingest: auto-orient (bake EXIF orientation into the pixels) + strip EXIF/GPS from the
    // stored room (orientation correctness + defense-in-depth, HARD RULE #9). Baking orientation here keeps
    // portrait uploads upright through scene analysis, the aspect-ratio pin, compose and the pixel-perfect base.
    const original = await deps.storage.getObject(gen.roomKey);
    const sanitized = await autoOrientAndStrip(original);
    if (sanitized !== original) {
      await deps.storage.putObject(gen.roomKey, sanitized, contentTypeForKey(gen.roomKey));
    }

    const roomUrl = await deps.storage.presignDownload(gen.roomKey);
    const snapshot = gen.productSnapshot;
    const category = snapshot.category as ProductCategory;

    // Step 1 — validate input (reject non-interior / unsafe, fail fast + refund, §7.4).
    const inputVerdict = await moderation.moderateInput({
      room: { url: roomUrl },
      product: { url: snapshot.imageUrl },
      category,
    });
    if (!inputVerdict.ok) {
      const errorCode = moderationErrorCode(inputVerdict.reason);
      await refundAndFail(db, {
        generationId,
        merchantId: gen.merchantId,
        creditsSpent: gen.creditsSpent,
        errorCode,
      });
      await notifyGenerationFailed(deps, gen, errorCode);
      deps.events?.track(
        generationEvent({ generationId, merchantId: gen.merchantId, status: 'failed', creditsSpent: gen.creditsSpent, errorCode }),
      );
      return 'failed';
    }

    // Multi-product (F2): all products composed into one image. A single-product row (productSnapshots null)
    // reads as the one-element [productSnapshot], so the single path is byte-identical to before.
    const productList: ProductSnapshot[] = gen.productSnapshots ?? [gen.productSnapshot];
    const isMulti = productList.length > 1;
    // The fashion / person path (e.g. a handbag on a shopper's selfie) is fully isolated behind `isFashion`.
    const isFashion = isFashionCategory(category);

    // The planner (§4.1) and the coverage estimate run in parallel (both best-effort). The product cutout
    // depends on the operation the planner decides, so it follows. (Phase 3 re-parallelizes the independent
    // pre-passes once routing lands.) Coverage is a single-product concept — skipped for a multi set.
    // Fashion SKIPS the planner: a furniture-oriented planner mis-reads a selfie as a room (it would
    // hallucinate walls/floors or flag isExterior, dragging scene/exterior anchoring into the prompt) and
    // skipping the flash call also shaves latency; a neutral plan keeps normalizeRoom a no-op (no deskew on a
    // portrait). Coverage is furniture-only too.
    const [genPlan, estimate] = await Promise.all([
      isFashion ? Promise.resolve(neutralGenerationPlan()) : planSafe(deps, gen, roomUrl),
      isMulti || isFashion
        ? Promise.resolve<QuantityEstimate | null>(null)
        : estimateCoverageSafe(deps, gen, category, roomUrl),
    ]);
    // Force the operation: fashion → accessory_placement (person path); a multi-product render is always a
    // multi-object placement (the planner's covering/replacement ops are single-object), else the planner's
    // mode. The plan's per-image facts still feed the compositor via the SceneAnalysis it consumes.
    const mode: GenerationMode = isFashion
      ? 'accessory_placement'
      : isMulti
        ? 'object_placement'
        : genPlan.mode;
    const scene = planToSceneAnalysis(genPlan);

    // Run the independent post-plan pre-passes in parallel (Phase 3 speed): the mode-dependent product
    // cutout(s) (§4.3 — object modes get a cached, fidelity-preserving cutout; surface_covering passes the
    // ORIGINAL product texture, since the model needs the repeating pattern) and the room normalization
    // (D65 — a gentle clamped deskew + conditional auto-level, best-effort). Neither depends on the other.
    const [productImages, normalized] = await Promise.all([
      resolveProductImages(deps, gen, productList, mode),
      normalizeRoom(sanitized, {
        tiltDegrees: scene.tiltDegrees,
        dark: scene.quality.dark,
        maxDeskewDegrees: DESKEW_MAX_DEGREES,
        autoLevelEnabled: AUTOLEVEL_ENABLED,
      }),
    ]);
    // The normalized room is stored back so the model composes against it and it becomes the pixel-perfect
    // base, so the result may be slightly straightened vs the raw upload (intended).
    if (normalized !== sanitized) {
      await deps.storage.putObject(gen.roomKey, normalized, contentTypeForKey(gen.roomKey));
    }

    // Pin the output aspect ratio to the (normalized) room so the generative edit can't re-frame/rotate it.
    const roomSize = await readImageSize(normalized);
    const aspectRatio = nearestAspectRatio(roomSize.width, roomSize.height) ?? undefined;

    // Pipeline diagnostics (one structured line per generation): room dims AFTER auto-orient + normalize
    // (portrait vs landscape pinpoints orientation issues), the aspect pin, scene tilt, and the coverage
    // quantity estimate (surfaced in the dashboard, D67). Cheap + high-signal in the Vercel runtime logs.
    console.info(
      '[gen] pipeline',
      JSON.stringify({
        generationId,
        roomW: roomSize.width,
        roomH: roomSize.height,
        aspectRatio: aspectRatio ?? null,
        mode,
        products: productList.length,
        sceneTilt: scene.tiltDegrees,
        coverage: estimate
          ? { isCoverage: estimate.isCoverage, qty: estimate.suggestedQuantity, conf: estimate.confidence }
          : null,
      }),
    );

    // Merchant placement guide (D88/D90): on the FASHION path, if one is configured, hand the model its image
    // as a positioning REFERENCE only (it expresses the intended carry, e.g. a handbag on the forearm). Never
    // copied; the real subject stays the uploaded selfie. Best-effort + SSRF-guarded — a bad guide URL never
    // fails or stalls the generation. Scoped to fashion for now: a person-pose guide bleeding into the (locked,
    // quality-sensitive) furniture path is an un-evaluated risk — extend to other categories deliberately later.
    const guideDiagram = isFashion ? await resolveGuideDiagram(deps, gen.merchantId, generationId) : undefined;

    // Mode-specific compose (§4.2): the compositor's task is assembled per operation — re-surfacing for
    // surface_covering, swapping for object_replacement, single placement otherwise — layered on the
    // always-true system instruction. One generative compose per product (no deterministic tiling); the
    // coverage QUANTITY is surfaced separately in the dashboard (D67).
    // Placement DEBUG (behind FASHION_PLACEMENT_DEBUG): on the fashion path, return the detector's overlay
    // (the computed product box drawn on the selfie) instead of a generation, so the owner can validate
    // detection accuracy cheaply (a flash vision call, no image gen) before we build the geometric composite.
    const placementDebug = isFashion && placementDebugEnabled();
    const composed = placementDebug
      ? await buildPlacementDebugResult(
          deps,
          { subject: { url: roomUrl }, product: productImages[0]!, category },
          normalized,
          snapshot.dimensions,
          roomSize,
        )
      : await deps.orchestrator.compose({
      room: { url: roomUrl },
      product: productImages[0]!,
      ...(guideDiagram ? { placementDiagram: guideDiagram } : {}),
      // Multi-product: hand the model every product image + per-product facts; the prompt switches to a
      // multi-object placement task. Single-product callers omit these and behave exactly as before. Fashion
      // is single-accessory in v1, so it never takes the multi-object path even if a row carries several.
      ...(isMulti && !isFashion
        ? {
            products: productImages,
            productInfos: productList.map((p) => ({
              name: p.name,
              category: p.category as ProductCategory,
              ...(p.dimensions ? { dimensions: p.dimensions } : {}),
            })),
          }
        : {}),
      category,
      placementHint: gen.placementHint ?? undefined,
      customInstructions: gen.customInstructions ?? undefined,
      // Product identity anchor (the planner's read of the product image), so the model reconstructs the
      // exact item even from a messy/in-context product photo. Single-product only — multi uses productInfos.
      ...(!isMulti && genPlan.productAnalysis ? { productDescription: genPlan.productAnalysis } : {}),
      dimensions: snapshot.dimensions,
      scene,
      mode,
      target: isMulti ? undefined : genPlan.target,
      repetition: isMulti ? undefined : genPlan.repetition,
      aspectRatio,
      // Phase 3 routing: fast common path, escalate to quality on a difficult scene / low confidence / top tier.
      // Multi-product is pinned to the FAST tier (D86): the quality model takes 69–133s on a multi set (over the
      // <1 min hard limit) with no visible quality gain over fast (~18s) on the lamp+panels case. Fashion has no
      // planner to escalate on and the face comes from the original pixels via the composite → fast by default.
      policy: isFashion
        ? resolvePolicyFashion(plan, FASHION_QUALITY_TIER)
        : isMulti
          ? 'fast'
          : resolvePolicy(plan, genPlan),
      watermark: plan === 'free',
    });

    // Mode-aware pixel-perfect composite (§4.4). Object modes are a localized change → keep only the region
    // the model actually changed (product + shadows) and composite it back over the ORIGINAL, so everything
    // else stays byte-identical to the upload (no re-frame/rotation/drift). surface_covering changes most of
    // the target surface by design → accept the full render and rely on the aspect-ratio pin + "keep framing"
    // instruction to prevent rotation/re-crop. Explicit, mode-driven branch.
    const finalImage =
      placementDebug || mode === 'surface_covering'
        ? { bytes: composed.bytes, contentType: composed.contentType }
        : await keepOnlyProductChange(
            normalized,
            composed,
            isFashion
              ? { maxFraction: CHANGE_MAX_FRACTION_FASHION, threshold: CHANGE_THRESHOLD_FASHION, fillHoles: true }
              : isMulti
                ? { maxFraction: CHANGE_MAX_FRACTION_MULTI }
                : {},
          );

    // Step 5 — moderate the final output before persisting; an unsafe composite is never billed.
    const outputVerdict = await moderation.moderateOutput(
      { bytes: finalImage.bytes, contentType: finalImage.contentType },
      category,
    );
    if (!outputVerdict.ok) {
      await refundAndFail(db, {
        generationId,
        merchantId: gen.merchantId,
        creditsSpent: gen.creditsSpent,
        errorCode: 'unsafe_output',
      });
      await notifyGenerationFailed(deps, gen, 'unsafe_output');
      deps.events?.track(
        generationEvent({ generationId, merchantId: gen.merchantId, status: 'failed', creditsSpent: gen.creditsSpent, errorCode: 'unsafe_output' }),
      );
      return 'failed';
    }

    const key = buildResultKey(gen.merchantId, generationId);
    await deps.storage.putObject(key, finalImage.bytes, finalImage.contentType);

    // Long-lived thumbnail (retention §9): a tiny WebP preview kept even after the originals are purged,
    // so the dashboard gallery still shows a visual. Best-effort — never let it fail a generation.
    let thumbKey: string | null = null;
    try {
      const thumb = await makeThumbnail(finalImage.bytes);
      if (thumb) {
        thumbKey = buildThumbKey(gen.merchantId, generationId);
        await deps.storage.putObject(thumbKey, thumb.bytes, thumb.contentType);
      }
    } catch (err) {
      thumbKey = null;
      deps.reportError?.(err, { generationId, stage: 'thumbnail' });
    }

    // Measure the stored result's real pixel size (the provider result carries none), so the asset row has
    // true width/height — used by the dashboard and as the ground truth for diagnosing orientation.
    const finalSize = await readImageSize(finalImage.bytes);

    // Coverage-quantity estimate (#7) — computed in the pre-compose pass above. Stored only for a confident
    // coverage estimate (> 1 unit); single-unit products and low confidence leave it null.
    const { suggestedQuantity, quantityRationale } = coverageStoreFields(estimate);

    // Prefer the REAL gateway cost (micro-USD) over the per-tier estimate; derive the rounded cents view
    // from whichever we have so cost_cents stays meaningful. (1¢ = 10_000 micros.)
    const costMicros = composed.costMicros ?? composed.costCents * 10_000;
    const costCents = Math.round(costMicros / 10_000);

    await finalizeSuccess(db, {
      generationId,
      merchantId: gen.merchantId,
      resultKey: key,
      thumbKey,
      model: composed.model,
      costCents,
      costMicros,
      latencyMs: composed.latencyMs,
      width: finalSize.width || composed.width,
      height: finalSize.height || composed.height,
      suggestedQuantity,
      quantityRationale,
    });
    deps.events?.track(
      generationEvent({
        generationId,
        merchantId: gen.merchantId,
        status: 'succeeded',
        model: composed.model,
        costCents,
        latencyMs: composed.latencyMs,
        creditsSpent: gen.creditsSpent,
      }),
    );
    return 'succeeded';
  } catch (err) {
    deps.reportError?.(err, { generationId, merchantId: gen.merchantId });
    const errorCode = errorCodeFor(err);
    await refundAndFail(db, {
      generationId,
      merchantId: gen.merchantId,
      creditsSpent: gen.creditsSpent,
      errorCode,
    });
    await notifyGenerationFailed(deps, gen, errorCode);
    deps.events?.track(
      generationEvent({ generationId, merchantId: gen.merchantId, status: 'failed', creditsSpent: gen.creditsSpent, errorCode }),
    );
    return 'failed';
  }
}

import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  MockModerationProvider,
  type AIOrchestrator,
  type ImageRef,
  type ModerationProvider,
  type ModerationReason,
  type RoutingPolicy,
} from '@lumina/ai';
import {
  generationAssets,
  generations,
  merchants,
  products,
  usageEvents,
  type Database,
} from '@lumina/db';
import type { ProductCategory } from '@lumina/shared';
import { resultKey as buildResultKey } from '../storage/keys.js';
import { contentTypeForKey, stripJpegMetadata } from '../images/exif.js';
import { nearestAspectRatio, readImageSize } from '../images/dimensions.js';
import { computeChangeMask, shouldComposite } from '../images/diff-mask.js';
import { compositeOverOriginal } from '../images/composite.js';
import { generationEvent, type EventSink } from '../observability.js';
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

/** Map a merchant plan to a routing policy (free → fast/watermark, top tiers → quality). */
export function planToPolicy(plan: string): RoutingPolicy {
  if (plan === 'free') return 'fast';
  if (plan === 'scale' || plan === 'enterprise') return 'quality';
  return 'balanced';
}

function errorCodeFor(_err: unknown): string {
  return 'generation_failed';
}

/** Below this model confidence a coverage estimate is dropped rather than shown to the shopper. */
const QUANTITY_CONFIDENCE_MIN = 0.5;

/**
 * Best-effort coverage-quantity estimate (#7). Returns nulls (never throws) so a flaky vision call can
 * never fail an otherwise-successful generation. Only a confident multi-unit coverage estimate is kept.
 */
async function estimateCoverage(
  deps: WorkflowDeps,
  gen: GenerationRow,
  category: ProductCategory,
  roomUrl: string,
): Promise<{ suggestedQuantity: number | null; quantityRationale: string | null }> {
  try {
    const est = await deps.orchestrator.estimateQuantity({
      room: { url: roomUrl },
      category,
      dimensions: gen.productSnapshot.dimensions,
      productName: gen.productSnapshot.name,
      placementHint: gen.placementHint ?? undefined,
    });
    if (est && est.isCoverage && est.confidence >= QUANTITY_CONFIDENCE_MIN && est.suggestedQuantity > 1) {
      return { suggestedQuantity: est.suggestedQuantity, quantityRationale: est.rationale };
    }
  } catch (err) {
    deps.reportError?.(err, { generationId: gen.id, stage: 'estimate_quantity' });
  }
  return { suggestedQuantity: null, quantityRationale: null };
}

// Change-detection knobs (tunable per env in S5 from the golden-set eval).
const CHANGE_THRESHOLD = Number(process.env.CHANGE_MASK_THRESHOLD ?? 28);
const CHANGE_FEATHER = Number(process.env.CHANGE_MASK_FEATHER ?? 6);
const CHANGE_MIN_FRACTION = Number(process.env.CHANGE_MIN_FRACTION ?? 0.002);
const CHANGE_MAX_FRACTION = Number(process.env.CHANGE_MAX_FRACTION ?? 0.6);

/**
 * Keep only the region the model actually changed (the product + its shadows) and composite it back over
 * the ORIGINAL, so the rest of the scene is byte-identical to the upload. Falls back to the full model
 * output when the detected change is implausibly small/large or the images can't be read. Never throws.
 */
async function keepOnlyProductChange(
  original: Uint8Array,
  composed: { bytes: Uint8Array; contentType: string },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  try {
    const change = await computeChangeMask(original, composed.bytes, {
      threshold: CHANGE_THRESHOLD,
      feather: CHANGE_FEATHER,
    });
    if (
      !shouldComposite(change.changedFraction, {
        minFraction: CHANGE_MIN_FRACTION,
        maxFraction: CHANGE_MAX_FRACTION,
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
function productCleanKey(merchantId: string, id: string): string {
  return `products/${merchantId}/clean/${id}.png`;
}

/**
 * Resolve the product image to compose with (Phase 1 / D63). Prefer a cached cutout
 * (`products.clean_image_key`); else compute one best-effort via the orchestrator's matting provider,
 * cache it on the catalog product (so the next generation skips the call), and use it. A matting cutout
 * preserves the product's exact pixels. Any failure — or no provider configured — degrades to the raw
 * product image; the cutout never fails or bills a generation.
 */
async function resolveProductImage(deps: WorkflowDeps, gen: GenerationRow): Promise<ImageRef> {
  const rawUrl = gen.productSnapshot.imageUrl;
  if (gen.productId) {
    const rows = await deps.db
      .select({ cleanImageKey: products.cleanImageKey })
      .from(products)
      .where(eq(products.id, gen.productId))
      .limit(1);
    const cleanKey = rows[0]?.cleanImageKey;
    if (cleanKey) {
      return { url: await deps.storage.presignDownload(cleanKey) };
    }
  }
  try {
    const cutout = await deps.orchestrator.bgRemoval({ url: rawUrl });
    if (cutout) {
      const key = productCleanKey(gen.merchantId, gen.productId ?? gen.id);
      await deps.storage.putObject(key, cutout.bytes, cutout.contentType);
      if (gen.productId) {
        await deps.db
          .update(products)
          .set({ cleanImageKey: key })
          .where(and(eq(products.id, gen.productId), eq(products.merchantId, gen.merchantId)));
      }
      return { url: await deps.storage.presignDownload(key) };
    }
  } catch (err) {
    deps.reportError?.(err, { generationId: gen.id, stage: 'bg_removal' });
  }
  return { url: rawUrl };
}

interface SuccessFields {
  generationId: string;
  merchantId: string;
  resultKey: string;
  model: string;
  costCents: number;
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
        model: p.model,
        costCents: p.costCents,
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

    // Sanitize on ingest: strip EXIF/GPS from the stored room (defense-in-depth, HARD RULE #9).
    const original = await deps.storage.getObject(gen.roomKey);
    const sanitized = stripJpegMetadata(original);
    if (sanitized !== original) {
      await deps.storage.putObject(gen.roomKey, sanitized, contentTypeForKey(gen.roomKey));
    }

    const roomUrl = await deps.storage.presignDownload(gen.roomKey);
    const snapshot = gen.productSnapshot;
    const category = snapshot.category as ProductCategory;

    // Pin the output aspect ratio to the uploaded room so the edit can't re-frame/rotate the scene.
    const roomSize = await readImageSize(sanitized);
    const aspectRatio = nearestAspectRatio(roomSize.width, roomSize.height) ?? undefined;

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

    // Compose against a clean product cutout when available (cached per product), else the raw image.
    const productImage = await resolveProductImage(deps, gen);

    const composed = await deps.orchestrator.compose({
      room: { url: roomUrl },
      product: productImage,
      category,
      placementHint: gen.placementHint ?? undefined,
      customInstructions: gen.customInstructions ?? undefined,
      dimensions: snapshot.dimensions,
      aspectRatio,
      policy: planToPolicy(plan),
      watermark: plan === 'free',
    });

    // Pixel-perfect step (#AI-gen v2): Gemini inserts the exact product but re-renders the whole frame.
    // Detect where it actually changed the scene and composite only that region back over the ORIGINAL,
    // so everything outside the product stays byte-identical to the upload (no re-frame/rotation/drift).
    // A too-small or too-large change means the diff is untrustworthy → keep the full (aspect-pinned) render.
    const finalImage = await keepOnlyProductChange(sanitized, composed);

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

    // Coverage-quantity estimate (#7) — best-effort: never fails the generation. Stored only for a
    // confident coverage estimate (> 1 unit); single-unit products and low confidence leave it null.
    const { suggestedQuantity, quantityRationale } = await estimateCoverage(deps, gen, category, roomUrl);

    await finalizeSuccess(db, {
      generationId,
      merchantId: gen.merchantId,
      resultKey: key,
      model: composed.model,
      costCents: composed.costCents,
      latencyMs: composed.latencyMs,
      width: composed.width,
      height: composed.height,
      suggestedQuantity,
      quantityRationale,
    });
    deps.events?.track(
      generationEvent({
        generationId,
        merchantId: gen.merchantId,
        status: 'succeeded',
        model: composed.model,
        costCents: composed.costCents,
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

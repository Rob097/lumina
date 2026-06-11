import { eq, sql } from 'drizzle-orm';
import {
  MockModerationProvider,
  type AIOrchestrator,
  type ModerationProvider,
  type ModerationReason,
  type RoutingPolicy,
} from '@lumina/ai';
import {
  generationAssets,
  generations,
  merchants,
  usageEvents,
  type Database,
} from '@lumina/db';
import type { ProductCategory } from '@lumina/shared';
import { resultKey as buildResultKey } from '../storage/keys.js';
import { contentTypeForKey, stripJpegMetadata } from '../images/exif.js';
import { generationEvent, type EventSink } from '../observability.js';

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
}

export type ProcessOutcome = 'succeeded' | 'failed' | 'skipped';

/** Map a moderation reason to a terminal generation error code. */
function moderationErrorCode(reason: ModerationReason): string {
  switch (reason) {
    case 'not_interior':
      return 'not_interior';
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

interface SuccessFields {
  generationId: string;
  merchantId: string;
  resultKey: string;
  model: string;
  costCents: number;
  latencyMs: number;
  width?: number;
  height?: number;
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

/** Terminal failure: mark failed + refund the credit (never bill a failed generation, HARD RULE #3). */
export async function refundAndFail(
  db: Database,
  p: { generationId: string; merchantId: string; creditsSpent: number; errorCode: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(generations)
      .set({ status: 'failed', errorCode: p.errorCode, finishedAt: new Date() })
      .where(eq(generations.id, p.generationId));
    await tx.execute(
      sql`select grant_credits(${p.merchantId}::uuid, ${p.creditsSpent}, 'refund', ${p.generationId})`,
    );
  });
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

  await db.update(generations).set({ status: 'processing' }).where(eq(generations.id, generationId));

  try {
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
      deps.events?.track(
        generationEvent({ generationId, merchantId: gen.merchantId, status: 'failed', creditsSpent: gen.creditsSpent, errorCode }),
      );
      return 'failed';
    }

    const composed = await deps.orchestrator.compose({
      room: { url: roomUrl },
      product: { url: snapshot.imageUrl },
      category,
      placementHint: gen.placementHint ?? undefined,
      customInstructions: gen.customInstructions ?? undefined,
      policy: planToPolicy(plan),
      watermark: plan === 'free',
    });

    // Step 5 — moderate output before persisting; an unsafe composite is never billed.
    const outputVerdict = await moderation.moderateOutput(
      { bytes: composed.bytes, contentType: composed.contentType },
      category,
    );
    if (!outputVerdict.ok) {
      await refundAndFail(db, {
        generationId,
        merchantId: gen.merchantId,
        creditsSpent: gen.creditsSpent,
        errorCode: 'unsafe_output',
      });
      deps.events?.track(
        generationEvent({ generationId, merchantId: gen.merchantId, status: 'failed', creditsSpent: gen.creditsSpent, errorCode: 'unsafe_output' }),
      );
      return 'failed';
    }

    const key = buildResultKey(gen.merchantId, generationId);
    await deps.storage.putObject(key, composed.bytes, composed.contentType);
    await finalizeSuccess(db, {
      generationId,
      merchantId: gen.merchantId,
      resultKey: key,
      model: composed.model,
      costCents: composed.costCents,
      latencyMs: composed.latencyMs,
      width: composed.width,
      height: composed.height,
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
    deps.events?.track(
      generationEvent({ generationId, merchantId: gen.merchantId, status: 'failed', creditsSpent: gen.creditsSpent, errorCode }),
    );
    return 'failed';
  }
}

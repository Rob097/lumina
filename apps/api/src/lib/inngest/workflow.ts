import { eq, sql } from 'drizzle-orm';
import type { AIOrchestrator, RoutingPolicy } from '@lumina/ai';
import {
  generationAssets,
  generations,
  merchants,
  usageEvents,
  type Database,
} from '@lumina/db';
import type { ProductCategory } from '@lumina/shared';
import { resultKey as buildResultKey } from '../storage/keys.js';

/** Minimal storage surface the workflow needs (satisfied by `R2Storage`). */
export interface StoragePort {
  presignDownload(key: string, expiresIn?: number): Promise<string>;
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

export interface WorkflowDeps {
  db: Database;
  orchestrator: AIOrchestrator;
  storage: StoragePort;
  reportError?: (err: unknown, context: Record<string, unknown>) => void;
}

export type ProcessOutcome = 'succeeded' | 'failed' | 'skipped';

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

    const roomUrl = await deps.storage.presignDownload(gen.roomKey);
    const snapshot = gen.productSnapshot;
    const composed = await deps.orchestrator.compose({
      room: { url: roomUrl },
      product: { url: snapshot.imageUrl },
      category: snapshot.category as ProductCategory,
      placementHint: gen.placementHint ?? undefined,
      policy: planToPolicy(plan),
      watermark: plan === 'free',
    });

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
    return 'succeeded';
  } catch (err) {
    deps.reportError?.(err, { generationId, merchantId: gen.merchantId });
    await refundAndFail(db, {
      generationId,
      merchantId: gen.merchantId,
      creditsSpent: gen.creditsSpent,
      errorCode: errorCodeFor(err),
    });
    return 'failed';
  }
}

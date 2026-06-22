import { and, eq, inArray, sql } from 'drizzle-orm';
import { generations, products, type Database, type ProductSnapshot } from '@lumina/db';
import type { Annotation, GenerationStatus, InlineProduct } from '@lumina/shared';
import type { NotifyInput } from '../notifications/service.js';
import { annotationRef, computeIdempotencyKey, inlineProductRef } from './idempotency.js';

/** Notify the merchant once when their balance crosses below this (emitted from the debiting path). */
const LOW_CREDITS_THRESHOLD = 20;

export class InsufficientCreditsError extends Error {
  constructor() {
    super('INSUFFICIENT_CREDITS');
    this.name = 'InsufficientCreditsError';
  }
}

export class ProductNotFoundError extends Error {
  constructor() {
    super('PRODUCT_NOT_FOUND');
    this.name = 'ProductNotFoundError';
  }
}

export interface GenerationEvent {
  name: 'generation.requested';
  data: { generationId: string; merchantId: string };
}

export interface GenerateDeps {
  enqueue(event: GenerationEvent): Promise<void>;
  /** Sign a stored result key into a readable URL (for cache hits). */
  signResult(resultKey: string): Promise<string>;
  /** Emit a dashboard notification (e.g. low credits). Optional — skipped when unset. */
  notify?: (input: NotifyInput) => Promise<void>;
}

export interface CreateGenerationInput {
  merchantId: string;
  /** Public SKU (`external_id`) — the widget path. */
  productId?: string;
  /** Internal product uuid — the authenticated Studio path (#8), works without an external SKU. */
  productUuid?: string;
  /**
   * Internal product uuids for a multi-product generation (F2, Studio). One combined render, one credit.
   * Order is significant (it feeds the idempotency key and the prompt). Takes precedence over the single
   * fields when present.
   */
  productUuids?: string[];
  inlineProduct?: InlineProduct;
  roomKey: string;
  placementHint?: string;
  customInstructions?: string;
  /** Freehand marks drawn over the room photo (F3) — persisted + burned onto the model's room by the workflow. */
  annotation?: Annotation;
  /** Studio: link the render to a client (#8). */
  clientId?: string;
  anonId?: string;
  pageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateGenerationResult {
  generationId: string;
  status: GenerationStatus;
  /** True only for an identical, already-succeeded result (returned for 0 credits). */
  cached: boolean;
  resultUrl?: string;
}

function pgCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

function isInsufficientCredits(err: unknown): boolean {
  return pgCode(err) === 'P0001' || (err instanceof Error && /INSUFFICIENT_CREDITS/.test(err.message));
}

function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === '23505';
}

async function resolveProduct(
  db: Database,
  input: CreateGenerationInput,
): Promise<{ productRef: string; snapshot: ProductSnapshot; productId?: string }> {
  if (input.productUuid) {
    // Studio (#8): the dashboard references its own catalog by internal uuid.
    const rows = await db
      .select({
        id: products.id,
        externalId: products.externalId,
        name: products.name,
        category: products.category,
        imageUrl: products.imageUrl,
        dimensions: products.dimensions,
      })
      .from(products)
      .where(and(eq(products.id, input.productUuid), eq(products.merchantId, input.merchantId)))
      .limit(1);
    const product = rows[0];
    if (!product) {
      throw new ProductNotFoundError();
    }
    return {
      productRef: product.externalId ?? product.id,
      productId: product.id,
      snapshot: {
        name: product.name,
        category: product.category,
        imageUrl: product.imageUrl,
        ...(product.dimensions ? { dimensions: product.dimensions } : {}),
      },
    };
  }
  if (input.productId) {
    // The public `productId` is the merchant's own SKU (`external_id`), not LUMINA's internal uuid —
    // the widget references `data-lumina-product="<SKU>"`. Resolve it to the internal id for the FK.
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        imageUrl: products.imageUrl,
        dimensions: products.dimensions,
      })
      .from(products)
      .where(and(eq(products.externalId, input.productId), eq(products.merchantId, input.merchantId)))
      .limit(1);
    const product = rows[0];
    if (!product) {
      throw new ProductNotFoundError();
    }
    return {
      productRef: input.productId,
      productId: product.id,
      snapshot: {
        name: product.name,
        category: product.category,
        imageUrl: product.imageUrl,
        ...(product.dimensions ? { dimensions: product.dimensions } : {}),
      },
    };
  }
  if (input.inlineProduct) {
    const ip = input.inlineProduct;
    return {
      productRef: inlineProductRef(ip),
      snapshot: {
        name: ip.name,
        category: ip.category ?? 'other',
        imageUrl: ip.imageUrl,
        ...(ip.dimensions ? { dimensions: ip.dimensions } : {}),
      },
    };
  }
  throw new ProductNotFoundError();
}

/**
 * Resolve every product for a generation into ordered refs + snapshots. Single-product callers (widget SKU,
 * inline, single Studio uuid) delegate to {@link resolveProduct} and come back as a one-element array, so
 * their behaviour and idempotency key are unchanged. The multi-product path (F2) resolves all uuids in ONE
 * merchant-scoped query (tenant isolation: any id not owned by the merchant → ProductNotFoundError) and
 * preserves request order. Each snapshot carries its catalog `id` so the workflow can cache the per-product
 * cutout.
 */
async function resolveProducts(
  db: Database,
  input: CreateGenerationInput,
): Promise<{ productRefs: string[]; snapshots: ProductSnapshot[]; primaryProductId?: string }> {
  if (input.productUuids && input.productUuids.length > 0) {
    const rows = await db
      .select({
        id: products.id,
        externalId: products.externalId,
        name: products.name,
        category: products.category,
        imageUrl: products.imageUrl,
        dimensions: products.dimensions,
      })
      .from(products)
      .where(and(inArray(products.id, input.productUuids), eq(products.merchantId, input.merchantId)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = input.productUuids.map((id) => byId.get(id));
    if (ordered.some((p) => !p)) {
      throw new ProductNotFoundError(); // an unknown id or one owned by another merchant
    }
    const resolved = ordered as NonNullable<(typeof ordered)[number]>[];
    return {
      productRefs: resolved.map((p) => p.externalId ?? p.id),
      snapshots: resolved.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        imageUrl: p.imageUrl,
        ...(p.dimensions ? { dimensions: p.dimensions } : {}),
      })),
      primaryProductId: resolved[0]!.id,
    };
  }
  const single = await resolveProduct(db, input);
  return { productRefs: [single.productRef], snapshots: [single.snapshot], primaryProductId: single.productId };
}

async function findExisting(db: Database, merchantId: string, idempotencyKey: string) {
  const rows = await db
    .select()
    .from(generations)
    .where(and(eq(generations.merchantId, merchantId), eq(generations.idempotencyKey, idempotencyKey)))
    .limit(1);
  return rows[0] ?? null;
}

async function mapExisting(
  row: { id: string; status: GenerationStatus; resultKey: string | null },
  deps: GenerateDeps,
): Promise<CreateGenerationResult> {
  if (row.status === 'succeeded' && row.resultKey) {
    return {
      generationId: row.id,
      status: row.status,
      cached: true,
      resultUrl: await deps.signResult(row.resultKey),
    };
  }
  return { generationId: row.id, status: row.status, cached: false };
}

/**
 * Accept a generation (§4 step 14-16): resolve the product, compute the idempotency key, return an
 * identical succeeded result for free, else atomically insert the row + `debit_credits` (1) in one
 * transaction and enqueue the workflow. Concurrent duplicates collapse onto the same row (no double bill).
 */
export async function createGeneration(
  db: Database,
  deps: GenerateDeps,
  input: CreateGenerationInput,
): Promise<CreateGenerationResult> {
  const { productRefs, snapshots, primaryProductId } = await resolveProducts(db, input);
  // One ordered ref string keeps the key stable: a single product hashes exactly as before (cache preserved),
  // and product order stays significant for multi-product renders.
  const idempotencyKey = computeIdempotencyKey({
    merchantId: input.merchantId,
    productRef: productRefs.join(','),
    roomKey: input.roomKey,
    placementHint: input.placementHint,
    customInstructions: input.customInstructions,
    ...(input.annotation ? { annotationHash: annotationRef(input.annotation) } : {}),
  });

  const existing = await findExisting(db, input.merchantId, idempotencyKey);
  if (existing) {
    return mapExisting(existing, deps);
  }

  let generationId: string;
  let balanceAfter: number | null = null;
  try {
    generationId = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(generations)
        .values({
          merchantId: input.merchantId,
          productId: primaryProductId,
          roomKey: input.roomKey,
          productSnapshot: snapshots[0]!,
          // Only multi-product renders carry the array; single-product rows stay null (existing reads unaffected).
          productSnapshots: snapshots.length > 1 ? snapshots : undefined,
          placementHint: input.placementHint,
          customInstructions: input.customInstructions,
          clientId: input.clientId,
          idempotencyKey,
          anonId: input.anonId,
          pageUrl: input.pageUrl,
          // The annotation rides in metadata (no schema column needed); the workflow reads + burns it.
          metadata: {
            ...(input.metadata ?? {}),
            ...(input.annotation ? { annotation: input.annotation } : {}),
          },
          status: 'queued',
        })
        .returning({ id: generations.id });
      const row = rows[0];
      if (!row) {
        throw new Error('failed to insert generation');
      }
      // Atomic debit of 1 credit, referencing the new generation row; capture the resulting balance.
      const debited = await tx.execute(
        sql`select debit_credits(${input.merchantId}::uuid, 1, ${row.id}::uuid) as balance`,
      );
      balanceAfter = Number((debited[0] as { balance?: number } | undefined)?.balance ?? Number.NaN);
      return row.id;
    });
  } catch (err) {
    if (isInsufficientCredits(err)) {
      throw new InsufficientCreditsError();
    }
    if (isUniqueViolation(err)) {
      const again = await findExisting(db, input.merchantId, idempotencyKey);
      if (again) {
        return mapExisting(again, deps);
      }
    }
    throw err;
  }

  await deps.enqueue({
    name: 'generation.requested',
    data: { generationId, merchantId: input.merchantId },
  });

  // Low-credits notice, emitted exactly once as the balance crosses the threshold downward (so a busy
  // store isn't pinged on every generation below it). Best-effort — never blocks the response.
  if (deps.notify && balanceAfter !== null && Number.isFinite(balanceAfter)) {
    const justCrossed =
      balanceAfter <= LOW_CREDITS_THRESHOLD && balanceAfter + 1 > LOW_CREDITS_THRESHOLD;
    if (justCrossed) {
      await deps
        .notify({
          merchantId: input.merchantId,
          type: 'low_credits',
          title: 'You’re low on credits',
          body: `Your balance is down to ${balanceAfter} credit${balanceAfter === 1 ? '' : 's'}. Top up to keep generating previews.`,
          data: { balance: balanceAfter },
        })
        .catch(() => {
          /* notification/email problems never affect the generation response */
        });
    }
  }

  return { generationId, status: 'queued', cached: false };
}

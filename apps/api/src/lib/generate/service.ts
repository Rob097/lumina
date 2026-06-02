import { and, eq, sql } from 'drizzle-orm';
import { generations, products, type Database, type ProductSnapshot } from '@lumina/db';
import type { GenerationStatus, InlineProduct } from '@lumina/shared';
import { computeIdempotencyKey, inlineProductRef } from './idempotency.js';

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
}

export interface CreateGenerationInput {
  merchantId: string;
  productId?: string;
  inlineProduct?: InlineProduct;
  roomKey: string;
  placementHint?: string;
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
): Promise<{ productRef: string; snapshot: ProductSnapshot }> {
  if (input.productId) {
    const rows = await db
      .select({ name: products.name, category: products.category, imageUrl: products.imageUrl })
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.merchantId, input.merchantId)))
      .limit(1);
    const product = rows[0];
    if (!product) {
      throw new ProductNotFoundError();
    }
    return {
      productRef: input.productId,
      snapshot: { name: product.name, category: product.category, imageUrl: product.imageUrl },
    };
  }
  if (input.inlineProduct) {
    const ip = input.inlineProduct;
    return {
      productRef: inlineProductRef(ip),
      snapshot: { name: ip.name, category: ip.category ?? 'other', imageUrl: ip.imageUrl },
    };
  }
  throw new ProductNotFoundError();
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
  const { productRef, snapshot } = await resolveProduct(db, input);
  const idempotencyKey = computeIdempotencyKey({
    merchantId: input.merchantId,
    productRef,
    roomKey: input.roomKey,
    placementHint: input.placementHint,
  });

  const existing = await findExisting(db, input.merchantId, idempotencyKey);
  if (existing) {
    return mapExisting(existing, deps);
  }

  let generationId: string;
  try {
    generationId = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(generations)
        .values({
          merchantId: input.merchantId,
          productId: input.productId,
          roomKey: input.roomKey,
          productSnapshot: snapshot,
          placementHint: input.placementHint,
          idempotencyKey,
          anonId: input.anonId,
          pageUrl: input.pageUrl,
          metadata: input.metadata ?? {},
          status: 'queued',
        })
        .returning({ id: generations.id });
      const row = rows[0];
      if (!row) {
        throw new Error('failed to insert generation');
      }
      // Atomic debit of 1 credit, referencing the new generation row.
      await tx.execute(sql`select debit_credits(${input.merchantId}::uuid, 1, ${row.id}::uuid)`);
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
  return { generationId, status: 'queued', cached: false };
}

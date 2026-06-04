import { and, eq, lt, or, sql } from 'drizzle-orm';
import { generations, type Database } from '@lumina/db';
import type {
  GenerationDetail,
  GenerationStatus,
  GenerationSummary,
  GenerationsListResponse,
} from '@lumina/shared';

/**
 * Merchant generations gallery (§6.3 `/generations`). Every query is scoped by `merchant_id`
 * (HARD RULE #1). Product name/category come from the stored `product_snapshot` so they survive
 * product deletion. Image URLs are derived through an injected builder (R2/CDN) so the service stays
 * unit-testable without storage; they are `null` when storage is unconfigured or there is no result.
 */
export interface GenerationDeps {
  /** Map an R2 object key to a public/resized URL, or `null` when unavailable. */
  imageUrl(key: string | null): string | null;
}

const NO_IMAGES: GenerationDeps = { imageUrl: () => null };

type GenerationRow = typeof generations.$inferSelect;

function encodeCursor(row: GenerationSummary): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt, id: row.id })).toString('base64url');
}

function decodeCursor(cursor: string): { t: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.t === 'string' && typeof parsed?.id === 'string') {
      return parsed;
    }
  } catch {
    /* malformed cursor → treat as no cursor */
  }
  return null;
}

function toSummary(row: GenerationRow, deps: GenerationDeps): GenerationSummary {
  return {
    id: row.id,
    status: row.status,
    productId: row.productId,
    productName: row.productSnapshot.name,
    productCategory: row.productSnapshot.category as GenerationSummary['productCategory'],
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    creditsSpent: row.creditsSpent,
    model: row.model,
    latencyMs: row.latencyMs,
    errorCode: row.errorCode,
    pageUrl: row.pageUrl,
    resultUrl: deps.imageUrl(row.resultKey),
    roomUrl: deps.imageUrl(row.roomKey),
  };
}

export interface ListGenerationsOptions {
  status?: GenerationStatus;
  productId?: string;
  limit?: number;
  cursor?: string;
}

export async function listGenerations(
  db: Database,
  merchantId: string,
  opts: ListGenerationsOptions = {},
  deps: GenerationDeps = NO_IMAGES,
): Promise<GenerationsListResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 100);

  const filters = [eq(generations.merchantId, merchantId)];
  if (opts.status) filters.push(eq(generations.status, opts.status));
  if (opts.productId) filters.push(eq(generations.productId, opts.productId));

  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (cursor) {
    const t = new Date(cursor.t);
    // keyset: everything strictly older than the cursor (createdAt desc, id desc)
    filters.push(
      or(
        lt(generations.createdAt, t),
        and(eq(generations.createdAt, t), lt(generations.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(generations)
    .where(and(...filters))
    .orderBy(sql`${generations.createdAt} desc, ${generations.id} desc`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((r) => toSummary(r, deps));
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

export async function getGeneration(
  db: Database,
  merchantId: string,
  id: string,
  deps: GenerationDeps = NO_IMAGES,
): Promise<GenerationDetail | null> {
  const [row] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.merchantId, merchantId)))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    ...toSummary(row, deps),
    anonId: row.anonId,
    costCents: row.costCents,
    placementHint: row.placementHint,
  };
}

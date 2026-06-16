import { and, desc, eq, ilike, sql } from 'drizzle-orm';
import { products, type Database } from '@lumina/db';
import type {
  BulkProductsResult,
  Product,
  ProductCategory,
  ProductInput,
  ProductUpdate,
  ProductsListResponse,
} from '@lumina/shared';

/**
 * Merchant product catalog (§6.3 `/products`). Every query is scoped by `merchant_id` (HARD RULE #1).
 * Deletes are soft (`active = false`) so historical generations keep their product reference; bulk
 * import upserts by `external_id`.
 */

type ProductRow = typeof products.$inferSelect;

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    merchantId: row.merchantId,
    externalId: row.externalId,
    name: row.name,
    category: row.category,
    imageUrl: row.imageUrl,
    cleanImageKey: row.cleanImageKey,
    dimensions: row.dimensions ?? null,
    attributes: row.attributes ?? {},
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ListProductsOptions {
  category?: ProductCategory;
  search?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export async function listProducts(
  db: Database,
  merchantId: string,
  opts: ListProductsOptions = {},
): Promise<ProductsListResponse> {
  const filters = [eq(products.merchantId, merchantId)];
  if (!opts.includeArchived) filters.push(eq(products.active, true));
  if (opts.category) filters.push(eq(products.category, opts.category));
  if (opts.search) filters.push(ilike(products.name, `%${opts.search}%`));
  const where = and(...filters);

  const [agg] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(where);
  const total = agg?.total ?? 0;

  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.createdAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);

  return { products: rows.map(toProduct), total };
}

export async function createProduct(
  db: Database,
  merchantId: string,
  input: ProductInput,
): Promise<Product> {
  const [row] = await db
    .insert(products)
    .values({
      merchantId,
      externalId: input.externalId ?? null,
      name: input.name,
      category: input.category,
      imageUrl: input.imageUrl,
      dimensions: input.dimensions ?? null,
      attributes: input.attributes ?? {},
    })
    .returning();
  return toProduct(row!);
}

export async function updateProduct(
  db: Database,
  merchantId: string,
  id: string,
  patch: ProductUpdate,
): Promise<Product | null> {
  const set: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (patch.externalId !== undefined) set.externalId = patch.externalId;
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.imageUrl !== undefined) set.imageUrl = patch.imageUrl;
  if (patch.dimensions !== undefined) set.dimensions = patch.dimensions;
  if (patch.attributes !== undefined) set.attributes = patch.attributes;

  const rows = await db
    .update(products)
    .set(set)
    .where(and(eq(products.id, id), eq(products.merchantId, merchantId)))
    .returning();
  return rows[0] ? toProduct(rows[0]) : null;
}

/** Soft-delete (archive). Returns whether a row owned by the merchant was affected. */
export async function archiveProduct(
  db: Database,
  merchantId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(products)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.merchantId, merchantId)))
    .returning({ id: products.id });
  return rows.length > 0;
}

/**
 * Upsert a batch by `external_id` (rows without one are always inserted). `enqueue` (optional) is called
 * once per **newly inserted** product after the transaction commits — used to eagerly compute its cutout
 * (Phase 1 / D63). Best-effort by contract: the caller's `enqueue` must not throw on its own failures.
 */
export async function bulkUpsertProducts(
  db: Database,
  merchantId: string,
  inputs: ProductInput[],
  enqueue?: (productId: string) => Promise<void>,
): Promise<BulkProductsResult> {
  let created = 0;
  let updated = 0;
  const insertedIds: string[] = [];

  await db.transaction(async (tx) => {
    for (const input of inputs) {
      const existing = input.externalId
        ? await tx
            .select({ id: products.id })
            .from(products)
            .where(
              and(eq(products.merchantId, merchantId), eq(products.externalId, input.externalId)),
            )
            .limit(1)
        : [];

      if (existing[0]) {
        await tx
          .update(products)
          .set({
            name: input.name,
            category: input.category,
            imageUrl: input.imageUrl,
            dimensions: input.dimensions ?? null,
            attributes: input.attributes ?? {},
            active: true,
            updatedAt: new Date(),
          })
          .where(eq(products.id, existing[0].id));
        updated += 1;
      } else {
        const [inserted] = await tx
          .insert(products)
          .values({
            merchantId,
            externalId: input.externalId ?? null,
            name: input.name,
            category: input.category,
            imageUrl: input.imageUrl,
            dimensions: input.dimensions ?? null,
            attributes: input.attributes ?? {},
          })
          .returning({ id: products.id });
        if (inserted) insertedIds.push(inserted.id);
        created += 1;
      }
    }
  });

  if (enqueue) {
    for (const id of insertedIds) {
      await enqueue(id);
    }
  }

  return { created, updated };
}

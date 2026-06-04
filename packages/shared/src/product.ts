import { z } from 'zod';
import { ProductCategorySchema } from './enums.js';

/** Physical product dimensions used for real-world scale matching (§3.4). */
export const DimensionsSchema = z.object({
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  d: z.number().positive().optional(),
  unit: z.enum(['cm', 'in']).optional(),
});
export type Dimensions = z.infer<typeof DimensionsSchema>;

/** Inline product passed by the widget without pre-registration (§3.4 OpenOptions.product). */
export const InlineProductSchema = z.object({
  name: z.string().min(1),
  imageUrl: z.string().url(),
  category: ProductCategorySchema.optional(),
  dimensions: DimensionsSchema.optional(),
});
export type InlineProduct = z.infer<typeof InlineProductSchema>;

/** Create/import payload for `POST /v1/products` (§6.3). */
export const ProductInputSchema = z.object({
  externalId: z.string().optional(),
  name: z.string().min(1),
  category: ProductCategorySchema.default('other'),
  imageUrl: z.string().url(),
  dimensions: DimensionsSchema.optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

/** Partial update payload for `PUT /v1/products/:id` (§6.3) — any subset of the input fields. */
export const ProductUpdateSchema = ProductInputSchema.partial();
export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

/** Batch upsert for `POST /v1/products/bulk` (CSV import) — keyed by `externalId` when present. */
export const BulkProductsInputSchema = z.object({
  products: z.array(ProductInputSchema).min(1).max(1000),
});
export type BulkProductsInput = z.infer<typeof BulkProductsInputSchema>;

export const BulkProductsResultSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
});
export type BulkProductsResult = z.infer<typeof BulkProductsResultSchema>;

/** Full product record as returned by the merchant API. */
export const ProductSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  externalId: z.string().nullable(),
  name: z.string(),
  category: ProductCategorySchema,
  imageUrl: z.string().url(),
  cleanImageKey: z.string().nullable(),
  dimensions: DimensionsSchema.nullable(),
  attributes: z.record(z.string(), z.unknown()),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

/** Response of `GET /v1/products` (§6.3). */
export const ProductsListResponseSchema = z.object({
  products: z.array(ProductSchema),
  total: z.number().int().nonnegative(),
});
export type ProductsListResponse = z.infer<typeof ProductsListResponseSchema>;

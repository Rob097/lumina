import { z } from 'zod';
import { GenerationStatusSchema, ProductCategorySchema } from './enums.js';

/**
 * Merchant-facing generation views (§6.3 `/generations`). The dashboard Generations gallery lists
 * these and opens a before/after detail. Product name/category come from the generation's stored
 * `product_snapshot`, so they survive product deletion. Image URLs are derived server-side (R2/CDN)
 * and may be `null` when storage is unconfigured or the run never produced a result.
 */
export const GenerationSummarySchema = z.object({
  id: z.string().uuid(),
  status: GenerationStatusSchema,
  productId: z.string().uuid().nullable(),
  productName: z.string(),
  productCategory: ProductCategorySchema,
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  creditsSpent: z.number().int(),
  model: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  pageUrl: z.string().nullable(),
  resultUrl: z.string().nullable(),
  roomUrl: z.string().nullable(),
  /** Studio (#8): the linked walk-in client, or `null` for widget/unlinked renders. */
  clientId: z.string().uuid().nullable(),
});
export type GenerationSummary = z.infer<typeof GenerationSummarySchema>;

/** Cursor-paginated list (`nextCursor` is the next page token, or `null` at the end). */
export const GenerationsListResponseSchema = z.object({
  items: z.array(GenerationSummarySchema),
  nextCursor: z.string().nullable(),
});
export type GenerationsListResponse = z.infer<typeof GenerationsListResponseSchema>;

/** `GET /v1/generations/:id` — the summary plus operational fields. */
export const GenerationDetailSchema = GenerationSummarySchema.extend({
  anonId: z.string().nullable(),
  costCents: z.number().int().nullable(),
  placementHint: z.string().nullable(),
  /** Coverage products (#7): how many units cover the surface, + a short rationale. Null otherwise. */
  suggestedQuantity: z.number().int().positive().nullable(),
  quantityRationale: z.string().nullable(),
});
export type GenerationDetail = z.infer<typeof GenerationDetailSchema>;

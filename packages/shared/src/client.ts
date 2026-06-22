import { z } from 'zod';
import { AnnotationSchema } from './annotation.js';

/**
 * Studio clients (#8) — a lightweight contact list for the physical-store use case. A merchant
 * generates a visualization in-dashboard and links it to a walk-in client (to email or keep on file).
 * Not a CRM: just enough to address a result and find a client's past renders.
 */
export const ClientInputSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});
export type ClientInput = z.infer<typeof ClientInputSchema>;

/** Partial update for `PUT /v1/clients/:id` — any subset of the input fields. */
export const ClientUpdateSchema = ClientInputSchema.partial();
export type ClientUpdate = z.infer<typeof ClientUpdateSchema>;

/** Full client record as returned by the merchant API. */
export const ClientSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Client = z.infer<typeof ClientSchema>;

/** Response of `GET /v1/clients`. */
export const ClientsListResponseSchema = z.object({
  clients: z.array(ClientSchema),
});
export type ClientsListResponse = z.infer<typeof ClientsListResponseSchema>;

/**
 * A client augmented with render activity, for the Studio rubric + overview (`GET /v1/clients?withStats=true`).
 * `generationCount` counts the client's linked generations; `lastGenerationAt` is the most recent, or
 * `null` when they have none yet.
 */
export const ClientWithStatsSchema = ClientSchema.extend({
  generationCount: z.number().int().nonnegative(),
  lastGenerationAt: z.string().nullable(),
});
export type ClientWithStats = z.infer<typeof ClientWithStatsSchema>;

/** Response of `GET /v1/clients?withStats=true`. */
export const ClientsWithStatsListResponseSchema = z.object({
  clients: z.array(ClientWithStatsSchema),
});
export type ClientsWithStatsListResponse = z.infer<typeof ClientsWithStatsListResponseSchema>;

/**
 * Most products we'll compose into a single generation. Each product is an extra reference image for the
 * model; quality and latency degrade past a handful, so we cap the set (shared by the schema + the Studio UI).
 */
export const MAX_PRODUCTS_PER_GENERATION = 5;

/**
 * `POST /v1/generations` (§6.3) — the authenticated, dashboard-side (Studio) generate entrypoint.
 * References one or more catalog products by internal uuid (works for items without an external SKU) and
 * may link the render to a client. Debits exactly one credit (one output image) through the same pipeline
 * as the widget, regardless of how many products are combined. A legacy single `productId` is accepted and
 * normalized to a one-element `productIds`, so older callers keep working.
 */
export const StudioGenerateRequestSchema = z
  .object({
    productId: z.string().uuid().optional(),
    productIds: z.array(z.string().uuid()).min(1).max(MAX_PRODUCTS_PER_GENERATION).optional(),
    roomKey: z.string().min(1),
    clientId: z.string().uuid().optional(),
    placementHint: z.string().max(120).optional(),
    customInstructions: z.string().max(280).optional(),
    /** Freehand marks drawn over the room photo (F3) — guidance for where to focus the edit. */
    annotation: AnnotationSchema.optional(),
  })
  .transform(({ productId, productIds, ...rest }) => ({
    ...rest,
    productIds: productIds ?? (productId ? [productId] : []),
  }))
  .refine((v) => v.productIds.length >= 1, {
    message: 'At least one product is required',
    path: ['productIds'],
  });
export type StudioGenerateRequest = z.infer<typeof StudioGenerateRequestSchema>;

/** `POST /v1/generations/:id/email` — email the finished render to a client (defaults to their email). */
export const EmailResultRequestSchema = z.object({
  email: z.string().email().optional(),
});
export type EmailResultRequest = z.infer<typeof EmailResultRequestSchema>;

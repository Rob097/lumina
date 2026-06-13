import { z } from 'zod';

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
 * `POST /v1/generations` (§6.3) — the authenticated, dashboard-side (Studio) generate entrypoint.
 * References a product by its internal uuid (works for catalog items without an external SKU) and may
 * link the render to a client. Debits one credit through the same pipeline as the widget.
 */
export const StudioGenerateRequestSchema = z.object({
  productId: z.string().uuid(),
  roomKey: z.string().min(1),
  clientId: z.string().uuid().optional(),
  placementHint: z.string().max(120).optional(),
  customInstructions: z.string().max(280).optional(),
});
export type StudioGenerateRequest = z.infer<typeof StudioGenerateRequestSchema>;

/** `POST /v1/generations/:id/email` — email the finished render to a client (defaults to their email). */
export const EmailResultRequestSchema = z.object({
  email: z.string().email().optional(),
});
export type EmailResultRequest = z.infer<typeof EmailResultRequestSchema>;

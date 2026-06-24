import { z } from 'zod';

/**
 * Technical-support contact form (Dashboard → Support). A merchant submits a short request that the
 * API relays by email to the YuzuView team. One Zod schema shared by the dashboard action and the API
 * route (HARD RULE #5/#6).
 */
export const SUPPORT_CATEGORIES = ['technical', 'billing', 'feature', 'other'] as const;
export const SupportCategorySchema = z.enum(SUPPORT_CATEGORIES);
export type SupportCategory = z.infer<typeof SupportCategorySchema>;

export const SupportRequestSchema = z.object({
  category: SupportCategorySchema.default('technical'),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(10).max(4000),
});
export type SupportRequest = z.infer<typeof SupportRequestSchema>;

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

/**
 * Parse a `topic`/`subject` deep-link into safe initial values for the support form. Used by callers that
 * route the user to the contact page pre-filled (e.g. the Enterprise "Contact sales" button). Tolerant of
 * junk: an unknown/absent topic falls back to `technical`, array-valued params are ignored, and the
 * subject is trimmed and clamped to the schema's 200-char ceiling so the form opens in a submittable state.
 */
export function parseSupportPrefill(params: {
  topic?: string | string[] | undefined;
  subject?: string | string[] | undefined;
}): { category: SupportCategory; subject: string } {
  const topic = typeof params.topic === 'string' ? params.topic : undefined;
  const subjectRaw = typeof params.subject === 'string' ? params.subject : '';
  const category = SupportCategorySchema.safeParse(topic);
  return {
    category: category.success ? category.data : 'technical',
    subject: subjectRaw.trim().slice(0, 200),
  };
}

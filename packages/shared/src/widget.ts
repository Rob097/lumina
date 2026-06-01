import { z } from 'zod';
import { LocaleSchema } from './enums.js';
import { ThemeSchema } from './config.js';

/** Post-result merchant CTA (e.g. "Add to cart") rendered inside the widget result view (§3.7). */
export const ResultCtaSchema = z.object({
  label: z.string().min(1),
  urlTemplate: z.string().min(1),
});
export type ResultCta = z.infer<typeof ResultCtaSchema>;

/** Limits surfaced to the widget so it can pre-validate uploads + show caps (§3.9). */
export const WidgetLimitsSchema = z.object({
  anonDailyCap: z.number().int().nonnegative(),
  maxUploadBytes: z.number().int().positive(),
  maxImageEdgePx: z.number().int().positive(),
});
export type WidgetLimits = z.infer<typeof WidgetLimitsSchema>;

/** Response of `GET /v1/widget/config` (§6.2). */
export const WidgetConfigResponseSchema = z.object({
  enabled: z.boolean(),
  theme: ThemeSchema,
  buttonText: z.string(),
  locale: LocaleSchema,
  i18n: z.record(z.string(), z.string()),
  watermark: z.boolean(),
  limits: WidgetLimitsSchema,
  resultCta: ResultCtaSchema.nullable(),
});
export type WidgetConfigResponse = z.infer<typeof WidgetConfigResponseSchema>;

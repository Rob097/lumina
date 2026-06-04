import { z } from 'zod';
import { LocaleSchema } from './enums.js';
import { ThemeModeSchema, ThemeSchema } from './config.js';

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

/** Hex color (`#rrggbb`) accepted by the Widget Settings accent picker. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * The editable subset of a merchant's widget configuration — the Widget Settings form payload
 * (`GET`/`PUT /v1/widget-config`, §6.3). A tighter, validated mirror of the columns the public
 * `WidgetConfigResponse` is derived from; the runtime `ThemeSchema` stays permissive for ingest.
 */
export const WidgetThemeSettingsSchema = z.object({
  accent: z.string().regex(HEX_COLOR, 'Accent must be a #rrggbb hex color').optional(),
  mode: ThemeModeSchema.optional(),
  radius: z.number().int().min(0).max(24).optional(),
  fontFamily: z.string().optional(),
});
export type WidgetThemeSettings = z.infer<typeof WidgetThemeSettingsSchema>;

export const WidgetSettingsSchema = z.object({
  buttonText: z.string().min(1).max(32),
  theme: WidgetThemeSettingsSchema,
  locale: LocaleSchema,
  i18n: z.record(z.string(), z.string()),
  watermark: z.boolean(),
  resultCta: ResultCtaSchema.nullable(),
});
export type WidgetSettings = z.infer<typeof WidgetSettingsSchema>;

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

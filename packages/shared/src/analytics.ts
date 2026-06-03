import { z } from 'zod';
import { ProductCategorySchema } from './enums.js';

/**
 * Dashboard analytics contracts (§6.3 `/analytics/*`). Computed server-side from `usage_events` +
 * `generations` (merchant-scoped); the dashboard renders KPIs, the funnel, and the timeseries chart.
 * Metrics are grounded in the events the widget actually emits (no fabricated numbers).
 */
export const DateRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const TopProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: ProductCategorySchema,
  generations: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
});
export type TopProduct = z.infer<typeof TopProductSchema>;

/** `GET /v1/analytics/summary`. */
export const AnalyticsSummarySchema = z.object({
  range: DateRangeSchema,
  impressions: z.number().int().nonnegative(),
  opens: z.number().int().nonnegative(),
  generations: z.number().int().nonnegative(),
  ctaClicks: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  topProducts: z.array(TopProductSchema),
});
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>;

/** Conversion-funnel steps, in order (built client-side from the summary counts). */
export const FUNNEL_STEPS = ['impressions', 'opens', 'generations', 'ctaClicks'] as const;
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number];

export const TIMESERIES_METRICS = ['generations', 'ctaClicks', 'opens', 'impressions'] as const;
export const TimeseriesMetricSchema = z.enum(TIMESERIES_METRICS);
export type TimeseriesMetric = z.infer<typeof TimeseriesMetricSchema>;

export const TimeseriesIntervalSchema = z.enum(['day', 'week']);
export type TimeseriesInterval = z.infer<typeof TimeseriesIntervalSchema>;

export const TimeseriesPointSchema = z.object({
  t: z.string(), // ISO bucket start
  generations: z.number().int().nonnegative(),
  ctaClicks: z.number().int().nonnegative(),
});
export type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>;

/** `GET /v1/analytics/timeseries` — feeds the Recharts area/line. */
export const TimeseriesResponseSchema = z.object({
  interval: TimeseriesIntervalSchema,
  points: z.array(TimeseriesPointSchema),
});
export type TimeseriesResponse = z.infer<typeof TimeseriesResponseSchema>;

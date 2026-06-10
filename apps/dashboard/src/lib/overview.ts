import { FUNNEL_STEPS, type FunnelStepKey } from '@lumina/shared';

/** Funnel + sparkline shaping for the Overview (pure, tested). */

/** Selectable reporting windows for the Overview (driven by the `?range=` search param). */
export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
export type RangeKey = keyof typeof RANGE_DAYS;
export const RANGE_ORDER: RangeKey[] = ['7d', '30d', '90d'];
export const RANGE_LABEL: Record<RangeKey, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

/** Coerce an untrusted `?range=` value to a known window, defaulting to 30 days. */
export function parseRange(value: string | undefined): RangeKey {
  return value && value in RANGE_DAYS ? (value as RangeKey) : '30d';
}

const FUNNEL_LABELS: Record<FunnelStepKey, string> = {
  impressions: 'Impressions',
  opens: 'Modal opens',
  generations: 'Generations',
  ctaClicks: 'CTA clicks',
};

export interface FunnelRow {
  key: FunnelStepKey;
  label: string;
  value: number;
  /** Conversion from the previous step (0..1); null for the first step. */
  rate: number | null;
  /** Bar width relative to the top of the funnel (0..100). */
  widthPct: number;
}

export interface FunnelInput {
  impressions: number;
  opens: number;
  generations: number;
  ctaClicks: number;
}

export function buildFunnel(input: FunnelInput): FunnelRow[] {
  const values = FUNNEL_STEPS.map((key) => input[key]);
  const top = values[0] ?? 0;
  return FUNNEL_STEPS.map((key, i) => {
    const value = values[i] ?? 0;
    const prev = i === 0 ? null : (values[i - 1] ?? 0);
    return {
      key,
      label: FUNNEL_LABELS[key],
      value,
      rate: prev === null ? null : prev > 0 ? value / prev : 0,
      widthPct: top > 0 ? Math.round((value / top) * 100) : 0,
    };
  });
}

export interface SparkPaths {
  line: string;
  area: string;
}

/** Map a numeric series to SVG line + area paths in a `width`×`height` box. Null if < 2 points. */
export function sparkPath(values: number[], width = 200, height = 36): SparkPaths | null {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i): [number, number] => [i * step, height - ((v - min) / range) * height]);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { line, area: `${line} L${width.toFixed(1)} ${height} L0 ${height} Z` };
}

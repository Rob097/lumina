/**
 * Pure formatting helpers for the dashboard. KPI values use full grouped numbers; space-constrained
 * places (nav counts, funnel, minibars) use the compact `k`/`M` form — matching the design prototype.
 */

const GROUP = new Intl.NumberFormat('en-US');

/** "12,847" — grouped thousands. */
export function groupThousands(n: number): string {
  return GROUP.format(n);
}

function trimZero(s: string): string {
  return s.replace(/\.0$/, '');
}

/** Compact above 10k ("12.8k", "218.4k", "1.2M"); grouped below ("7,108", "950"). */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 10_000) return groupThousands(n);
  if (abs < 1_000_000) return `${trimZero((n / 1_000).toFixed(1))}k`;
  if (abs < 1_000_000_000) return `${trimZero((n / 1_000_000).toFixed(1))}M`;
  return `${trimZero((n / 1_000_000_000).toFixed(1))}B`;
}

/** Format a 0..1 ratio as a percentage string, e.g. 0.956 → "95.6%". */
export function pct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export type DeltaDir = 'up' | 'down' | 'flat';

export interface Delta {
  pct: number;
  dir: DeltaDir;
}

/** Period-over-period change. Growth from zero counts as up; equal values are flat. */
export function delta(current: number, previous: number): Delta {
  if (previous <= 0) {
    if (current > 0) return { pct: 100, dir: 'up' };
    return { pct: 0, dir: 'flat' };
  }
  const change = ((current - previous) / previous) * 100;
  const dir: DeltaDir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return { pct: Math.abs(change), dir };
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "May 1" (UTC, to keep formatting deterministic regardless of the server's timezone). */
export function shortDate(date: Date): string {
  return SHORT_DATE.format(date);
}

/** "May 1 – May 31, 2026" — the year is taken from the end date. */
export function rangeLabel(from: Date, to: Date): string {
  return `${shortDate(from)} – ${shortDate(to)}, ${to.getUTCFullYear()}`;
}

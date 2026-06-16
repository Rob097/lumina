import type { ProductCategory } from '@lumina/shared';

/**
 * Quality eval scoring (§M5.3). A golden set of room+product pairs is composed (scripted) and each
 * outcome scored here — pure + tested. Drives a launch-readiness report: success rate, latency/cost,
 * and the human 👍 rate, broken down by category, so prompts/resolution can be tuned before launch.
 */
export interface EvalCaseResult {
  id: string;
  category: ProductCategory;
  /**
   * Input difficulty class (Phase 0): 'standard' vs a non-standard bucket (e.g. 'tilted', 'dark',
   * 'blurry', 'ambiguous', 'exterior', 'messy-product'). Absent ⇒ counted as 'standard'.
   */
  inputClass?: string;
  status: 'succeeded' | 'failed';
  latencyMs?: number;
  costCents?: number;
  /** Human rating, when collected. `true`/`false` count toward the 👍 rate; absent = unrated. */
  thumbsUp?: boolean | null;
}

export interface CategoryScore {
  total: number;
  succeeded: number;
  successRate: number;
}

/** Full per-group breakdown (success + latency + cost + 👍), used per input class. */
export interface ClassScore {
  total: number;
  succeeded: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostCents: number;
  rated: number;
  thumbsUpRate: number;
}

export interface EvalReport {
  total: number;
  succeeded: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostCents: number;
  rated: number;
  thumbsUpRate: number;
  byCategory: Record<string, CategoryScore>;
  /** Phase 0: the same metrics broken down by input difficulty class (the regression gate's lens). */
  byInputClass: Record<string, ClassScore>;
}

function safeRate(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

/** Aggregate success / latency / cost / 👍 over a set of cases (latency/cost averaged over succeeded). */
function classScore(cases: EvalCaseResult[]): ClassScore {
  const succeededCases = cases.filter((r) => r.status === 'succeeded');
  const succeeded = succeededCases.length;
  const ratedCases = cases.filter((r) => r.thumbsUp === true || r.thumbsUp === false);
  const thumbsUp = ratedCases.filter((r) => r.thumbsUp === true).length;
  const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);
  return {
    total: cases.length,
    succeeded,
    successRate: safeRate(succeeded, cases.length),
    avgLatencyMs: Math.round(safeRate(sum(succeededCases.map((r) => r.latencyMs ?? 0)), succeeded)),
    avgCostCents: Math.round(safeRate(sum(succeededCases.map((r) => r.costCents ?? 0)), succeeded)),
    rated: ratedCases.length,
    thumbsUpRate: safeRate(thumbsUp, ratedCases.length),
  };
}

/** Group cases by a key derived from each case. */
function groupBy(results: EvalCaseResult[], key: (r: EvalCaseResult) => string): Record<string, EvalCaseResult[]> {
  const groups: Record<string, EvalCaseResult[]> = {};
  for (const r of results) {
    (groups[key(r)] ??= []).push(r);
  }
  return groups;
}

export function scoreEval(results: EvalCaseResult[]): EvalReport {
  const overall = classScore(results);

  const byCategory: Record<string, CategoryScore> = {};
  for (const [category, cases] of Object.entries(groupBy(results, (r) => r.category))) {
    const s = classScore(cases);
    byCategory[category] = { total: s.total, succeeded: s.succeeded, successRate: s.successRate };
  }

  const byInputClass: Record<string, ClassScore> = {};
  for (const [cls, cases] of Object.entries(groupBy(results, (r) => r.inputClass ?? 'standard'))) {
    byInputClass[cls] = classScore(cases);
  }

  return {
    total: overall.total,
    succeeded: overall.succeeded,
    successRate: overall.successRate,
    avgLatencyMs: overall.avgLatencyMs,
    avgCostCents: overall.avgCostCents,
    rated: overall.rated,
    thumbsUpRate: overall.thumbsUpRate,
    byCategory,
    byInputClass,
  };
}

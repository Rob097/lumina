import type { ProductCategory } from '@lumina/shared';

/**
 * Quality eval scoring (§M5.3). A golden set of room+product pairs is composed (scripted) and each
 * outcome scored here — pure + tested. Drives a launch-readiness report: success rate, latency/cost,
 * and the human 👍 rate, broken down by category, so prompts/resolution can be tuned before launch.
 */
export interface EvalCaseResult {
  id: string;
  category: ProductCategory;
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

export interface EvalReport {
  total: number;
  succeeded: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostCents: number;
  rated: number;
  thumbsUpRate: number;
  byCategory: Record<string, CategoryScore>;
}

function safeRate(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

export function scoreEval(results: EvalCaseResult[]): EvalReport {
  const succeededCases = results.filter((r) => r.status === 'succeeded');
  const succeeded = succeededCases.length;

  const latencies = succeededCases.map((r) => r.latencyMs ?? 0);
  const costs = succeededCases.map((r) => r.costCents ?? 0);
  const ratedCases = results.filter((r) => r.thumbsUp === true || r.thumbsUp === false);
  const thumbsUp = ratedCases.filter((r) => r.thumbsUp === true).length;

  const byCategory: Record<string, CategoryScore> = {};
  for (const r of results) {
    const c = (byCategory[r.category] ??= { total: 0, succeeded: 0, successRate: 0 });
    c.total += 1;
    if (r.status === 'succeeded') c.succeeded += 1;
  }
  for (const c of Object.values(byCategory)) {
    c.successRate = safeRate(c.succeeded, c.total);
  }

  return {
    total: results.length,
    succeeded,
    successRate: safeRate(succeeded, results.length),
    avgLatencyMs: Math.round(safeRate(
      latencies.reduce((a, b) => a + b, 0),
      succeeded,
    )),
    avgCostCents: Math.round(safeRate(
      costs.reduce((a, b) => a + b, 0),
      succeeded,
    )),
    rated: ratedCases.length,
    thumbsUpRate: safeRate(thumbsUp, ratedCases.length),
    byCategory,
  };
}

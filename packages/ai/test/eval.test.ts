import { describe, expect, it } from 'vitest';
import { scoreEval, type EvalCaseResult } from '../src/eval.js';

const results: EvalCaseResult[] = [
  { id: 'a', category: 'lighting', status: 'succeeded', latencyMs: 8000, costCents: 13, thumbsUp: true },
  { id: 'b', category: 'lighting', status: 'succeeded', latencyMs: 12000, costCents: 13, thumbsUp: false },
  { id: 'c', category: 'furniture', status: 'failed' },
];

describe('scoreEval', () => {
  it('aggregates success / latency / cost / 👍 rates', () => {
    const r = scoreEval(results);
    expect(r.total).toBe(3);
    expect(r.succeeded).toBe(2);
    expect(r.successRate).toBeCloseTo(2 / 3);
    expect(r.avgLatencyMs).toBe(10000); // (8000+12000)/2 over succeeded
    expect(r.avgCostCents).toBe(13);
    expect(r.rated).toBe(2);
    expect(r.thumbsUpRate).toBe(0.5);
  });

  it('breaks down success by category', () => {
    const r = scoreEval(results);
    expect(r.byCategory.lighting).toMatchObject({ total: 2, succeeded: 2, successRate: 1 });
    expect(r.byCategory.furniture).toMatchObject({ total: 1, succeeded: 0, successRate: 0 });
  });

  it('is safe for an empty run (no division by zero)', () => {
    const r = scoreEval([]);
    expect(r).toMatchObject({ total: 0, succeeded: 0, successRate: 0, avgLatencyMs: 0, thumbsUpRate: 0 });
  });
});

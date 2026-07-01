import { describe, expect, it } from 'vitest';
import { timeoutConfig } from '../src/factory.js';

describe('timeoutConfig (env → per-call timeout budget)', () => {
  it('applies safe defaults that sum to under the 120s function limit', () => {
    const t = timeoutConfig({});
    expect(t.composeAttemptTimeoutMs).toBe(55_000);
    expect(t.composeTotalTimeoutMs).toBe(85_000);
    expect(t.plannerTimeoutMs).toBe(18_000);
    expect(t.quantityTimeoutMs).toBe(18_000);
    expect(t.detectorTimeoutMs).toBe(18_000);
    expect(t.bgRemovalTimeoutMs).toBe(25_000);
    // Worst-case default budget stays under the 120s Vercel maxDuration with margin.
    const worstCase = Math.max(t.plannerTimeoutMs, t.quantityTimeoutMs) + t.composeTotalTimeoutMs;
    expect(worstCase).toBeLessThan(120_000);
  });

  it('honours overrides and ignores non-positive / non-numeric values', () => {
    const t = timeoutConfig({
      AI_COMPOSE_ATTEMPT_TIMEOUT_MS: '40000',
      AI_COMPOSE_TOTAL_TIMEOUT_MS: '0', // invalid → falls back to default
      AI_PLANNER_TIMEOUT_MS: 'nope', // invalid → falls back to default
    });
    expect(t.composeAttemptTimeoutMs).toBe(40_000);
    expect(t.composeTotalTimeoutMs).toBe(85_000);
    expect(t.plannerTimeoutMs).toBe(18_000);
  });
});

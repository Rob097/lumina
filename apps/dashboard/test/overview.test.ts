import { describe, it, expect } from 'vitest';
import { buildFunnel, sparkPath } from '../src/lib/overview';

describe('buildFunnel', () => {
  const f = buildFunnel({ impressions: 200_000, opens: 68_000, generations: 12_000, ctaClicks: 3_000 });

  it('orders the steps and bases widths on impressions', () => {
    expect(f.map((s) => s.key)).toEqual(['impressions', 'opens', 'generations', 'ctaClicks']);
    expect(f[0]).toMatchObject({ rate: null, widthPct: 100 });
  });

  it('computes step-over-step conversion rates', () => {
    expect(f[1]?.rate).toBeCloseTo(0.34, 2);
    expect(f[2]?.rate).toBeCloseTo(12_000 / 68_000, 4);
    expect(f[1]?.widthPct).toBe(34);
  });

  it('handles an all-zero summary without dividing by zero', () => {
    const z = buildFunnel({ impressions: 0, opens: 0, generations: 0, ctaClicks: 0 });
    expect(z[0]).toMatchObject({ widthPct: 0, rate: null });
    expect(z[1]?.rate).toBe(0);
  });
});

describe('sparkPath', () => {
  it('builds line + area paths for a series', () => {
    const sp = sparkPath([1, 3, 2, 5]);
    expect(sp?.line.startsWith('M0')).toBe(true);
    expect(sp?.area.endsWith('Z')).toBe(true);
  });

  it('returns null for too few points', () => {
    expect(sparkPath([5])).toBeNull();
    expect(sparkPath([])).toBeNull();
  });
});

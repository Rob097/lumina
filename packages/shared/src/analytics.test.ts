import { describe, it, expect } from 'vitest';
import {
  AnalyticsSummarySchema,
  TimeseriesResponseSchema,
  TimeseriesMetricSchema,
  FUNNEL_STEPS,
} from './analytics.js';

const validSummary = {
  range: { from: '2026-05-01T00:00:00.000Z', to: '2026-05-31T00:00:00.000Z' },
  impressions: 218_400,
  opens: 74_300,
  generations: 12_847,
  ctaClicks: 3_612,
  successRate: 0.956,
  topProducts: [
    { id: 'p1', name: 'Aura Floor Lamp', category: 'lighting', generations: 1284, successRate: 0.964 },
  ],
};

describe('AnalyticsSummarySchema', () => {
  it('parses a valid summary', () => {
    expect(AnalyticsSummarySchema.parse(validSummary).generations).toBe(12_847);
  });

  it('rejects a successRate outside 0..1', () => {
    expect(() => AnalyticsSummarySchema.parse({ ...validSummary, successRate: 1.5 })).toThrow();
  });
});

describe('TimeseriesResponseSchema', () => {
  it('parses points with the two Overview series', () => {
    const res = TimeseriesResponseSchema.parse({
      interval: 'day',
      points: [{ t: '2026-05-01', generations: 320, ctaClicks: 88 }],
    });
    expect(res.points[0]?.ctaClicks).toBe(88);
  });

  it('rejects an unknown interval', () => {
    expect(() =>
      TimeseriesResponseSchema.parse({ interval: 'month', points: [] }),
    ).toThrow();
  });
});

describe('analytics enums', () => {
  it('exposes the timeseries metrics and funnel steps', () => {
    expect(TimeseriesMetricSchema.parse('generations')).toBe('generations');
    expect(FUNNEL_STEPS).toEqual(['impressions', 'opens', 'generations', 'ctaClicks']);
  });
});

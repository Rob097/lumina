import { describe, it, expect } from 'vitest';
import { compact, groupThousands, pct, delta, shortDate, rangeLabel } from '../src/lib/format';

describe('groupThousands', () => {
  it('inserts thousands separators', () => {
    expect(groupThousands(12_847)).toBe('12,847');
    expect(groupThousands(2_840)).toBe('2,840');
    expect(groupThousands(0)).toBe('0');
  });
});

describe('compact', () => {
  it('abbreviates from 10k upward, groups below', () => {
    expect(compact(12_800)).toBe('12.8k');
    expect(compact(218_400)).toBe('218.4k');
    expect(compact(1_200_000)).toBe('1.2M');
    expect(compact(7_108)).toBe('7,108');
    expect(compact(3_612)).toBe('3,612');
    expect(compact(950)).toBe('950');
  });

  it('drops a trailing .0', () => {
    expect(compact(20_000)).toBe('20k');
  });
});

describe('pct', () => {
  it('formats a 0..1 ratio as a percentage', () => {
    expect(pct(0.956)).toBe('95.6%');
    expect(pct(0.34)).toBe('34.0%');
    expect(pct(1)).toBe('100.0%');
    expect(pct(0.281, 1)).toBe('28.1%');
  });
});

describe('delta', () => {
  it('computes direction + percentage change', () => {
    expect(delta(12_847, 10_870)).toMatchObject({ dir: 'up' });
    expect(delta(12_847, 10_870).pct).toBeCloseTo(18.2, 1);
    expect(delta(100, 120).dir).toBe('down');
    expect(delta(100, 100)).toMatchObject({ dir: 'flat', pct: 0 });
  });

  it('treats growth from zero as up', () => {
    expect(delta(5, 0).dir).toBe('up');
    expect(delta(0, 0).dir).toBe('flat');
  });
});

describe('dates', () => {
  it('formats a short date in UTC', () => {
    expect(shortDate(new Date('2026-05-01T00:00:00Z'))).toBe('May 1');
  });

  it('formats a range with the year from the end date', () => {
    expect(rangeLabel(new Date('2026-05-01T00:00:00Z'), new Date('2026-05-31T00:00:00Z'))).toBe(
      'May 1 – May 31, 2026',
    );
  });
});

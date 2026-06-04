import { describe, it, expect } from 'vitest';
import { activeNavKey } from '@lumina/ui';
import { initials, creditMeter } from '../src/lib/shell';

describe('activeNavKey', () => {
  it('matches the exact route and nested routes (longest href wins)', () => {
    expect(activeNavKey('/overview')).toBe('overview');
    expect(activeNavKey('/products/abc-123')).toBe('products');
    expect(activeNavKey('/widget')).toBe('widget');
    expect(activeNavKey('/unknown')).toBeUndefined();
  });
});

describe('initials', () => {
  it('builds two-letter initials from a name', () => {
    expect(initials('Atelier Módena')).toBe('AM');
    expect(initials('Sofia Ricci')).toBe('SR');
    expect(initials('lumina')).toBe('LU');
    expect(initials('')).toBe('?');
  });
});

describe('creditMeter', () => {
  it('computes used percentage + warning level', () => {
    expect(creditMeter(300, 1200)).toEqual({ usedPct: 75, level: 'warn' });
    expect(creditMeter(1100, 1200)).toEqual({ usedPct: 8, level: 'ok' });
    expect(creditMeter(50, 1200)).toEqual({ usedPct: 96, level: 'danger' });
    expect(creditMeter(5000, 1200)).toEqual({ usedPct: 0, level: 'ok' });
  });
});

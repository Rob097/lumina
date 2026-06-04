import { describe, expect, it } from 'vitest';
import { clampSliderPct, pctFromPointer } from '../src/lib/slider';

describe('clampSliderPct', () => {
  it('clamps to the 0–100 range', () => {
    expect(clampSliderPct(-10)).toBe(0);
    expect(clampSliderPct(150)).toBe(100);
    expect(clampSliderPct(42)).toBe(42);
  });
});

describe('pctFromPointer', () => {
  const rect = { left: 100, width: 200 };

  it('maps a pointer x within the element to a percentage', () => {
    expect(pctFromPointer(100, rect)).toBe(0);
    expect(pctFromPointer(200, rect)).toBe(50);
    expect(pctFromPointer(300, rect)).toBe(100);
  });

  it('clamps pointers outside the element', () => {
    expect(pctFromPointer(0, rect)).toBe(0);
    expect(pctFromPointer(9999, rect)).toBe(100);
  });

  it('is safe for a zero-width element', () => {
    expect(pctFromPointer(50, { left: 0, width: 0 })).toBe(0);
  });
});

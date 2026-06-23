import { describe, it, expect } from 'vitest';
import { regionFromStrokes, placementPhrase } from './region.js';
import type { Annotation } from './annotation.js';

const ann = (strokes: { x: number; y: number }[][]): Annotation => ({
  color: '#ffffff',
  alpha: 0.6,
  width: 0.012,
  strokes: strokes.map((points) => ({ points })),
});

describe('regionFromStrokes', () => {
  it('returns the padded, clamped bbox of all stroke points', () => {
    const b = regionFromStrokes(ann([[{ x: 0.7, y: 0.3 }, { x: 0.9, y: 0.8 }]]));
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y + b.h).toBeLessThanOrEqual(1);
    expect(b.x).toBeLessThan(0.7); // padded left of the leftmost point
    expect(b.x + b.w).toBeGreaterThan(0.9); // padded right of the rightmost point
  });

  it('enforces a minimum size for a tiny scribble', () => {
    const b = regionFromStrokes(ann([[{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 }]]));
    expect(b.w).toBeGreaterThanOrEqual(0.04);
    expect(b.h).toBeGreaterThanOrEqual(0.04);
  });

  it('unions multiple strokes', () => {
    const b = regionFromStrokes(ann([[{ x: 0.1, y: 0.1 }], [{ x: 0.6, y: 0.7 }]]));
    expect(b.x).toBeLessThan(0.1);
    expect(b.x + b.w).toBeGreaterThan(0.6);
  });
});

describe('placementPhrase', () => {
  it('maps a right-side region to a right phrase', () => {
    expect(placementPhrase({ x: 0.64, y: 0.22, w: 0.31, h: 0.5 })).toMatch(/right/);
  });
  it('maps an upper-left region', () => {
    const p = placementPhrase({ x: 0.02, y: 0.02, w: 0.2, h: 0.2 });
    expect(p).toMatch(/left/);
    expect(p).toMatch(/upper/);
  });
  it('maps a large centered region to an "across most" phrase', () => {
    expect(placementPhrase({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })).toMatch(/across most/);
  });
});

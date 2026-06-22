import { describe, expect, it } from 'vitest';
import { annotationColor, buildAnnotation, normalizedPoint } from '../src/lib/annotation';

describe('normalizedPoint', () => {
  it('maps a pointer position to 0..1 within the rect', () => {
    expect(normalizedPoint(50, 25, { left: 0, top: 0, width: 100, height: 50 })).toEqual({ x: 0.5, y: 0.5 });
  });
  it('accounts for the rect offset', () => {
    expect(normalizedPoint(60, 30, { left: 10, top: 10, width: 100, height: 100 })).toEqual({ x: 0.5, y: 0.2 });
  });
  it('clamps coordinates outside the rect to 0..1', () => {
    expect(normalizedPoint(-10, 100, { left: 0, top: 0, width: 100, height: 50 })).toEqual({ x: 0, y: 1 });
  });
});

describe('annotationColor', () => {
  it('keeps a valid #rrggbb color', () => {
    expect(annotationColor('#5A55D6')).toBe('#5A55D6');
  });
  it('falls back to the brand accent for a non-hex value', () => {
    expect(annotationColor('rgb(1,2,3)')).toBe('#5a55d6');
    expect(annotationColor('')).toBe('#5a55d6');
    expect(annotationColor(null)).toBe('#5a55d6');
  });
});

describe('buildAnnotation', () => {
  it('returns null when nothing was drawn', () => {
    expect(buildAnnotation([], '#5a55d6')).toBeNull();
    expect(buildAnnotation([[]], '#5a55d6')).toBeNull();
  });
  it('builds strokes from points and carries the color', () => {
    const a = buildAnnotation([[{ x: 0, y: 0 }, { x: 1, y: 1 }]], '#5a55d6');
    expect(a?.strokes).toHaveLength(1);
    expect(a?.strokes[0]?.points).toHaveLength(2);
    expect(a?.color).toBe('#5a55d6');
    expect(a?.alpha).toBeGreaterThan(0);
  });
});

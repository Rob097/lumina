import { describe, expect, it } from 'vitest';
import {
  annotationRegionLabel,
  AnnotationSchema,
  buildAnnotation,
  MAX_ANNOTATION_STROKES,
  MAX_POINTS_PER_STROKE,
  normalizedPoint,
  PointSchema,
  StrokeSchema,
} from './annotation.js';

const stroke = (n = 2) => ({ points: Array.from({ length: n }, (_, i) => ({ x: i / 10, y: i / 10 })) });

describe('PointSchema', () => {
  it('accepts normalized 0..1 coordinates', () => {
    expect(PointSchema.parse({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
  });
  it('rejects coordinates outside 0..1', () => {
    expect(PointSchema.safeParse({ x: -0.1, y: 0.5 }).success).toBe(false);
    expect(PointSchema.safeParse({ x: 0.5, y: 1.2 }).success).toBe(false);
  });
});

describe('StrokeSchema', () => {
  it('requires at least one point', () => {
    expect(StrokeSchema.safeParse({ points: [] }).success).toBe(false);
  });
  it('caps the number of points', () => {
    const tooMany = { points: Array.from({ length: MAX_POINTS_PER_STROKE + 1 }, () => ({ x: 0.5, y: 0.5 })) };
    expect(StrokeSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe('AnnotationSchema', () => {
  it('parses a valid annotation and defaults alpha + width', () => {
    const a = AnnotationSchema.parse({ color: '#5A55D6', strokes: [stroke()] });
    expect(a.color).toBe('#5A55D6');
    expect(a.alpha).toBe(0.6);
    expect(a.width).toBeGreaterThan(0);
  });

  it('honors explicit alpha and width', () => {
    const a = AnnotationSchema.parse({ color: '#000000', alpha: 0.4, width: 0.02, strokes: [stroke()] });
    expect(a.alpha).toBe(0.4);
    expect(a.width).toBe(0.02);
  });

  it('rejects a non-hex color', () => {
    expect(AnnotationSchema.safeParse({ color: 'red', strokes: [stroke()] }).success).toBe(false);
    expect(AnnotationSchema.safeParse({ color: '#fff', strokes: [stroke()] }).success).toBe(false);
  });

  it('rejects an alpha outside 0..1', () => {
    expect(AnnotationSchema.safeParse({ color: '#000000', alpha: 1.5, strokes: [stroke()] }).success).toBe(false);
  });

  it('requires at least one stroke and caps the total', () => {
    expect(AnnotationSchema.safeParse({ color: '#000000', strokes: [] }).success).toBe(false);
    const tooMany = { color: '#000000', strokes: Array.from({ length: MAX_ANNOTATION_STROKES + 1 }, () => stroke()) };
    expect(AnnotationSchema.safeParse(tooMany).success).toBe(false);
  });
});

describe('annotationRegionLabel', () => {
  const ann = (pts: Array<{ x: number; y: number }>) => ({
    color: '#000000',
    alpha: 0.6,
    width: 0.012,
    strokes: [{ points: pts }],
  });

  it('labels a right-side mark "right"', () => {
    expect(annotationRegionLabel(ann([{ x: 0.8, y: 0.5 }, { x: 0.9, y: 0.5 }]))).toBe('right');
  });
  it('labels a centered mark "center"', () => {
    expect(annotationRegionLabel(ann([{ x: 0.45, y: 0.48 }, { x: 0.55, y: 0.52 }]))).toBe('center');
  });
  it('labels a top-left mark "top-left"', () => {
    expect(annotationRegionLabel(ann([{ x: 0.05, y: 0.05 }, { x: 0.15, y: 0.12 }]))).toBe('top-left');
  });
  it('labels a purely vertical offset by row only ("top")', () => {
    expect(annotationRegionLabel(ann([{ x: 0.45, y: 0.05 }, { x: 0.55, y: 0.12 }]))).toBe('top');
  });
  it('returns an empty string when there are no points', () => {
    expect(annotationRegionLabel({ color: '#000000', alpha: 0.6, width: 0.012, strokes: [] })).toBe('');
  });
});

describe('normalizedPoint', () => {
  it('maps a pointer position to 0..1 within the rect (accounting for offset)', () => {
    expect(normalizedPoint(60, 30, { left: 10, top: 10, width: 100, height: 100 })).toEqual({ x: 0.5, y: 0.2 });
  });
  it('clamps coordinates outside the rect', () => {
    expect(normalizedPoint(-10, 200, { left: 0, top: 0, width: 100, height: 50 })).toEqual({ x: 0, y: 1 });
  });
});

describe('buildAnnotation', () => {
  it('returns null when nothing was drawn', () => {
    expect(buildAnnotation([], '#5a55d6')).toBeNull();
    expect(buildAnnotation([[]], '#5a55d6')).toBeNull();
  });
  it('builds a schema-valid annotation from strokes', () => {
    const a = buildAnnotation([[{ x: 0, y: 0 }, { x: 1, y: 1 }]], '#5a55d6');
    expect(a).not.toBeNull();
    expect(AnnotationSchema.safeParse(a).success).toBe(true);
    expect(a?.strokes[0]?.points).toHaveLength(2);
    expect(a?.color).toBe('#5a55d6');
  });
  it('caps strokes and points', () => {
    const many = Array.from({ length: MAX_ANNOTATION_STROKES + 5 }, () => [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]);
    expect(buildAnnotation(many, '#000000')?.strokes.length).toBe(MAX_ANNOTATION_STROKES);
  });
});

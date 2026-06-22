import { z } from 'zod';

/**
 * Freehand annotation (F3): the shopper/merchant draws over their room photo to mark where to focus the
 * edit — place/replace the product, highlight a region. Strokes are normalized vectors (0..1 of the image),
 * sent in the generate request; the server rasterizes + burns them onto a copy of the room for the model.
 * The marks use the surface's accent color at reduced opacity, never red.
 */

/** Caps to bound the request payload (a freehand session never needs more). */
export const MAX_ANNOTATION_STROKES = 50;
export const MAX_POINTS_PER_STROKE = 500;
/** Default stroke opacity — translucent so the model reads it as a hint, not part of the scene. */
export const DEFAULT_ANNOTATION_ALPHA = 0.6;
/** Default stroke width as a fraction of the image's long edge. */
export const DEFAULT_ANNOTATION_WIDTH = 0.012;

/** A point in normalized image space (0..1), origin top-left. */
export const PointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type Point = z.infer<typeof PointSchema>;

/** One freehand stroke: an ordered polyline of normalized points. */
export const StrokeSchema = z.object({
  points: z.array(PointSchema).min(1).max(MAX_POINTS_PER_STROKE),
});
export type Stroke = z.infer<typeof StrokeSchema>;

/** A whole annotation: the color (#rrggbb), opacity, stroke width (fraction of long edge), and the strokes. */
export const AnnotationSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb hex color'),
  alpha: z.number().min(0).max(1).default(DEFAULT_ANNOTATION_ALPHA),
  width: z.number().positive().max(0.2).default(DEFAULT_ANNOTATION_WIDTH),
  strokes: z.array(StrokeSchema).min(1).max(MAX_ANNOTATION_STROKES),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

/**
 * Map a pointer position to a normalized 0..1 point within a rect (origin top-left). Shared by the Studio
 * and widget drawing canvases so a stroke recorded on either surface rasterizes identically server-side.
 */
export function normalizedPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Point {
  const w = rect.width || 1;
  const h = rect.height || 1;
  return { x: clamp01((clientX - rect.left) / w), y: clamp01((clientY - rect.top) / h) };
}

/**
 * Build an {@link Annotation} from drawn strokes (each a list of normalized points), in the given color.
 * Drops empty strokes and enforces the caps; returns null when nothing was drawn. The caller is responsible
 * for passing a valid #rrggbb color (the canvas surfaces resolve their accent first).
 */
export function buildAnnotation(strokes: Point[][], color: string): Annotation | null {
  const cleaned = strokes
    .map((pts) => pts.slice(0, MAX_POINTS_PER_STROKE))
    .filter((pts) => pts.length > 0)
    .slice(0, MAX_ANNOTATION_STROKES);
  if (cleaned.length === 0) {
    return null;
  }
  return {
    color,
    alpha: DEFAULT_ANNOTATION_ALPHA,
    width: DEFAULT_ANNOTATION_WIDTH,
    strokes: cleaned.map((points) => ({ points })),
  };
}

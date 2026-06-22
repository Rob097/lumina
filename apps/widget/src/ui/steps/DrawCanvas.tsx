import { useEffect, useRef, useState } from 'preact/hooks';
import {
  buildAnnotation,
  normalizedPoint,
  DEFAULT_ANNOTATION_ALPHA,
  DEFAULT_ANNOTATION_WIDTH,
  type Annotation,
  type Point,
} from '@lumina/shared';
import type { Translate } from '../../core/i18n.js';

/**
 * Freehand draw layer (F3): the room preview with a canvas overlay the shopper draws on (mouse + touch) to
 * mark where the product should go. Strokes are kept normalized; on each change it builds the
 * {@link Annotation} (in the merchant's accent color) and hands it up. Drawing is optional — an empty canvas
 * yields a null annotation. No drawing library: a few canvas calls keep the widget under its bundle budget.
 */
export interface DrawCanvasProps {
  t: Translate;
  imageUrl: string;
  color: string;
  onChange: (annotation: Annotation | null) => void;
}

export function DrawCanvas({ t, imageUrl, color, onChange }: DrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [count, setCount] = useState(0);

  function redraw(): void {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = color;
    ctx.globalAlpha = DEFAULT_ANNOTATION_ALPHA;
    ctx.lineWidth = Math.max(2, DEFAULT_ANNOTATION_WIDTH * Math.max(c.width, c.height));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const s of strokes.current) {
      if (s.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(s[0]!.x * c.width, s[0]!.y * c.height);
      for (let i = 1; i < s.length; i += 1) ctx.lineTo(s[i]!.x * c.width, s[i]!.y * c.height);
      if (s.length === 1) ctx.lineTo(s[0]!.x * c.width + 0.1, s[0]!.y * c.height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = (): void => {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width));
      c.height = Math.max(1, Math.round(r.height));
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  function commit(): void {
    redraw();
    setCount(strokes.current.length);
    onChange(buildAnnotation(strokes.current, color));
  }

  const point = (e: PointerEvent): Point =>
    normalizedPoint(e.clientX, e.clientY, canvasRef.current!.getBoundingClientRect());

  function down(e: PointerEvent): void {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokes.current.push([point(e)]);
    commit();
  }
  function move(e: PointerEvent): void {
    if (!drawing.current) return;
    strokes.current[strokes.current.length - 1]!.push(point(e));
    commit();
  }
  function end(): void {
    drawing.current = false;
  }
  function undo(): void {
    strokes.current.pop();
    commit();
  }
  function clear(): void {
    strokes.current = [];
    commit();
  }

  return (
    <div class="lumina-draw">
      <div class="lumina-draw-stage">
        <img class="lumina-preview" src={imageUrl} alt="" />
        <canvas
          ref={canvasRef}
          class="lumina-draw-canvas"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
      </div>
      <div class="lumina-draw-tools">
        <span class="lumina-muted lumina-draw-hint">{t('draw.hint')}</span>
        <button type="button" class="lumina-draw-tool" onClick={undo} disabled={count === 0}>
          {t('draw.undo')}
        </button>
        <button type="button" class="lumina-draw-tool" onClick={clear} disabled={count === 0}>
          {t('draw.clear')}
        </button>
      </div>
    </div>
  );
}

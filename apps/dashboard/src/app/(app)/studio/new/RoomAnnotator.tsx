'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '@lumina/shared';
import { normalizedPoint } from '@/lib/annotation';

/**
 * Freehand annotator (F3): the room photo with a canvas overlay the merchant draws on (mouse + touch) to
 * mark where to focus the edit. Strokes are stored normalized (0..1) and handed up via `onChange`; the
 * parent builds the {@link Annotation} at submit and the server burns it onto the model's room. Drawing is
 * optional — an empty canvas yields no annotation.
 */

const STROKE_ALPHA = 0.6;
const STROKE_WIDTH_FRACTION = 0.012;

export function RoomAnnotator({
  imageUrl,
  color,
  onChange,
}: {
  imageUrl: string;
  color: string;
  onChange: (strokes: Point[][]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef(false);
  const [count, setCount] = useState(0); // re-render the toolbar (undo/clear enabled state)

  const redraw = useCallback(
    (toDraw: Point[][]) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.globalAlpha = STROKE_ALPHA;
      ctx.lineWidth = Math.max(2, STROKE_WIDTH_FRACTION * Math.max(width, height));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const stroke of toDraw) {
        if (stroke.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(stroke[0]!.x * width, stroke[0]!.y * height);
        for (let i = 1; i < stroke.length; i += 1) {
          ctx.lineTo(stroke[i]!.x * width, stroke[i]!.y * height);
        }
        if (stroke.length === 1) ctx.lineTo(stroke[0]!.x * width + 0.1, stroke[0]!.y * height); // a tap = a dot
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [color],
  );

  // Match the canvas buffer to its displayed size and redraw, now and on resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));
      redraw(strokesRef.current);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  const commit = useCallback(
    (next: Point[][]): void => {
      strokesRef.current = next;
      setCount(next.length);
      redraw(next);
      onChange(next);
    },
    [redraw, onChange],
  );

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point =>
    normalizedPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    commit([...strokesRef.current, [pointFrom(e)]]);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const cur = strokesRef.current;
    const last = cur[cur.length - 1];
    if (!last) return;
    commit([...cur.slice(0, -1), [...last, pointFrom(e)]]);
  };
  const endStroke = (): void => {
    drawingRef.current = false;
  };

  return (
    <div className="studio-annotator">
      <div className="studio-annotator-stage">
        <img src={imageUrl} alt="Room" className="studio-annotator-img" />
        <canvas
          ref={canvasRef}
          className="studio-annotator-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
      <div className="studio-annotator-tools">
        <span className="studio-hint">Draw on the photo to mark where to focus (optional).</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => commit(strokesRef.current.slice(0, -1))}
          disabled={count === 0}
        >
          Undo
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => commit([])} disabled={count === 0}>
          Clear
        </button>
      </div>
    </div>
  );
}

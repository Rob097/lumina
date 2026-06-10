'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { pctFromPointer } from '@/lib/slider';

/**
 * Drag-to-compare before/after wipe. Renders the result (after) under the room (before); when an
 * image URL is missing it falls back to a labeled gradient so the control still reads. Position math
 * is the unit-tested `pctFromPointer`.
 */
export function BeforeAfter({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string | null;
  afterUrl: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pos, setPos] = useState(50);

  function move(clientX: number) {
    const el = ref.current;
    if (el) setPos(pctFromPointer(clientX, el.getBoundingClientRect()));
  }
  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e.clientX);
  }
  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragging.current) move(e.clientX);
  }
  function onUp() {
    dragging.current = false;
  }

  return (
    <div
      className="ba2"
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="ba2-layer ba2-after">
        {afterUrl ? (
          <img src={afterUrl} alt="Result composite" draggable={false} />
        ) : (
          <span className="ba2-fallback ba2-fallback-after" />
        )}
      </div>
      {/* Full-box layer revealed by a clip-path wipe so the image stays pixel-aligned with `after`. */}
      <div className="ba2-layer ba2-before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {beforeUrl ? (
          <img src={beforeUrl} alt="Original room" draggable={false} />
        ) : (
          <span className="ba2-fallback ba2-fallback-before" />
        )}
      </div>
      <span className="ba2-cap ba2-cap-after">AFTER</span>
      <span className="ba2-cap ba2-cap-before">BEFORE</span>
      <div className="ba2-handle" style={{ left: `${pos}%` }}>
        <span className="ba2-grip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
          </svg>
        </span>
      </div>
    </div>
  );
}

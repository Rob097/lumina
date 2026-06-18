'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { pctFromPointer } from '@/lib/slider';

/**
 * Drag-to-compare before/after wipe. The room (before) sits on the LEFT, the composite (after) on the
 * RIGHT; labels sit in the matching top corners. Images are letterboxed (`contain`) so the whole frame
 * is always visible, and a fullscreen button opens the result at full size. Position math is the
 * unit-tested `pctFromPointer`.
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
  const [fullscreen, setFullscreen] = useState(false);

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

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  return (
    <>
      <div
        className="ba2"
        ref={ref}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* Base layer = AFTER (result), revealed on the right. */}
        <div className="ba2-layer ba2-after">
          {afterUrl ? (
            <img src={afterUrl} alt="Result composite" draggable={false} />
          ) : (
            <span className="ba2-fallback ba2-fallback-after" />
          )}
        </div>
        {/* BEFORE layer clipped from the left so the room shows on the left of the wipe. */}
        <div className="ba2-layer ba2-before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {beforeUrl ? (
            <img src={beforeUrl} alt="Original room" draggable={false} />
          ) : (
            <span className="ba2-fallback ba2-fallback-before" />
          )}
        </div>

        <span className="ba2-cap ba2-cap-before">Before</span>
        <span className="ba2-cap ba2-cap-after">After</span>

        {afterUrl ? (
          <button
            type="button"
            className="ba2-fs-btn"
            aria-label="View result fullscreen"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setFullscreen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        ) : null}

        <div className="ba2-handle" style={{ left: `${pos}%` }}>
          <span className="ba2-grip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
            </svg>
          </span>
        </div>
      </div>

      {fullscreen && afterUrl ? (
        <div className="ba2-fs" role="dialog" aria-modal="true" onClick={() => setFullscreen(false)}>
          <button type="button" className="ba2-fs-close" aria-label="Close fullscreen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <img src={afterUrl} alt="Result composite" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </>
  );
}

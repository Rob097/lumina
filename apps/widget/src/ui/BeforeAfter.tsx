import { useRef, useState } from 'preact/hooks';

/** Map a pointer X to a clamped 0–100 slider percentage. Pure + tested. */
export function sliderPosition(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 50;
  const pct = ((clientX - rect.left) / rect.width) * 100;
  return Math.max(0, Math.min(100, pct));
}

export interface BeforeAfterProps {
  beforeUrl: string;
  resultUrl: string;
  beforeLabel: string;
  afterLabel: string;
}

/** Draggable before/after comparison slider (§3 result state). Pointer + keyboard accessible. */
export function BeforeAfter({ beforeUrl, resultUrl, beforeLabel, afterLabel }: BeforeAfterProps) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  const updateFrom = (clientX: number): void => {
    const el = ref.current;
    if (el) setPos(sliderPosition(clientX, el.getBoundingClientRect()));
  };

  const onPointer = (event: PointerEvent): void => {
    if (event.type === 'pointerdown' || event.buttons === 1) updateFrom(event.clientX);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
    if (event.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
  };

  return (
    <div class="lumina-ba" ref={ref} onPointerDown={onPointer} onPointerMove={onPointer}>
      <img class="lumina-ba-img" src={resultUrl} alt={afterLabel} draggable={false} />
      <div class="lumina-ba-clip" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img class="lumina-ba-img" src={beforeUrl} alt={beforeLabel} draggable={false} />
      </div>
      <span class="lumina-ba-tag lumina-ba-tag-before">{beforeLabel}</span>
      <span class="lumina-ba-tag lumina-ba-tag-after">{afterLabel}</span>
      <div
        class="lumina-ba-handle"
        style={{ left: `${pos}%` }}
        role="slider"
        tabIndex={0}
        aria-label={afterLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={onKey}
      />
    </div>
  );
}

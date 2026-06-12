import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { trapFocus } from './mount.js';

/**
 * Focus-trapped, mobile-first modal shell (§3.2). Clicking the overlay or pressing Escape closes it;
 * the "Powered by LUMINA" footer shows when the watermark is on (free tier / configured).
 */
export interface ModalProps {
  onClose: () => void;
  watermark: boolean;
  poweredByLabel: string;
  closeLabel: string;
  /** Widen the modal — used for the result step so the before/after isn't cramped. */
  wide?: boolean;
  children: ComponentChildren;
}

export function Modal({ onClose, watermark, poweredByLabel, closeLabel, wide, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The parent hands a fresh `onClose` on every re-render (it re-renders on each keystroke). Read the
  // latest via a ref so the focus-trap effect can run exactly once and never re-grab focus mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const dispose = trapFocus(el, { onEscape: () => onCloseRef.current() });
    el.focus();
    return dispose;
  }, []);

  return (
    <div
      class="lumina-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class={`lumina-modal${wide ? ' lumina-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button class="lumina-close" type="button" aria-label={closeLabel} onClick={onClose}>
          ×
        </button>
        <div class="lumina-body">{children}</div>
        {watermark ? <div class="lumina-powered">{poweredByLabel}</div> : null}
      </div>
    </div>
  );
}

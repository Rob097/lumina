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
  children: ComponentChildren;
}

export function Modal({ onClose, watermark, poweredByLabel, closeLabel, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const dispose = trapFocus(el, { onEscape: onClose });
    el.focus();
    return dispose;
  }, [onClose]);

  return (
    <div
      class="lumina-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="lumina-modal" role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef}>
        <button class="lumina-close" type="button" aria-label={closeLabel} onClick={onClose}>
          ×
        </button>
        <div class="lumina-body">{children}</div>
        {watermark ? <div class="lumina-powered">{poweredByLabel}</div> : null}
      </div>
    </div>
  );
}

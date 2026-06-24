import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { trapFocus } from './mount.js';

/**
 * Focus-trapped, mobile-first modal shell (§3.2). Clicking the overlay or pressing Escape closes it.
 * The footer holds a "Powered by YuzuView" link (shown when the watermark is on — free tier / configured)
 * and an always-present legal/privacy notice (how shopper photos are processed + the retention window).
 */
export interface ModalProps {
  onClose: () => void;
  watermark: boolean;
  poweredByLabel: string;
  /** YuzuView landing URL the attribution links to. */
  poweredByHref: string;
  /** Short retention/processing sentence shown to every shopper. */
  legalNotice: string;
  /** Label for the privacy/terms link. */
  privacyLabel: string;
  /** Privacy/terms page URL. */
  privacyHref: string;
  closeLabel: string;
  /** Widen the modal — used for the result step so the before/after isn't cramped. */
  wide?: boolean;
  children: ComponentChildren;
}

export function Modal({
  onClose,
  watermark,
  poweredByLabel,
  poweredByHref,
  legalNotice,
  privacyLabel,
  privacyHref,
  closeLabel,
  wide,
  children,
}: ModalProps) {
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
        <div class="lumina-foot">
          {watermark ? (
            <a
              class="lumina-powered"
              href={poweredByHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {poweredByLabel}
            </a>
          ) : null}
          <p class="lumina-legal">
            {legalNotice}{' '}
            <a
              class="lumina-legal-link"
              href={privacyHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {privacyLabel}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

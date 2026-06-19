import type { JSX } from 'preact';
import type { ErrorCode } from '@lumina/shared';
import type { Translate } from '../../core/i18n.js';

/** Map an error code to one of the three user-facing error kinds (§3.6 graceful errors). */
export function errorKey(code?: ErrorCode): 'bad_image' | 'failed' | 'out_of_credits' {
  if (code === 'insufficient_credits') return 'out_of_credits';
  if (code === 'unsupported_image' || code === 'invalid_input') return 'bad_image';
  return 'failed';
}

export interface ErrorStateProps {
  t: Translate;
  code?: ErrorCode;
  onRetry: () => void;
}

const ICONS: Record<'bad_image' | 'failed' | 'out_of_credits', JSX.Element> = {
  bad_image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 14l4-4 4 4 3-3 4 4" />
      <path d="M2 2l20 20" />
    </svg>
  ),
  failed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  out_of_credits: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
};

export function ErrorState({ t, code, onRetry }: ErrorStateProps) {
  const kind = errorKey(code);
  return (
    <div class={`lumina-state lumina-error lumina-error-${kind}`} role="alert">
      <span class="lumina-error-icon" aria-hidden="true">
        {ICONS[kind]}
      </span>
      <h2 class="lumina-title">{t(`error.${kind}.title`)}</h2>
      <p class="lumina-muted">{t(`error.${kind}.body`)}</p>
      <button class="lumina-btn lumina-btn-primary" type="button" onClick={onRetry}>
        {t('error.retry')}
      </button>
    </div>
  );
}

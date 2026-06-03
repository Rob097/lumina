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

export function ErrorState({ t, code, onRetry }: ErrorStateProps) {
  const kind = errorKey(code);
  return (
    <div class="lumina-state lumina-error" role="alert">
      <h2 class="lumina-title">{t(`error.${kind}.title`)}</h2>
      <p class="lumina-muted">{t(`error.${kind}.body`)}</p>
      <button class="lumina-btn lumina-btn-primary" type="button" onClick={onRetry}>
        {t('error.retry')}
      </button>
    </div>
  );
}

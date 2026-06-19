import { useState } from 'preact/hooks';
import type { FeedbackRating, ResultCta } from '@lumina/shared';
import type { Translate } from '../../core/i18n.js';
import { BeforeAfter } from '../BeforeAfter.js';

/**
 * Result state (§3.6): draggable before/after, Save/Share/Regenerate, 👍/👎, and the configurable
 * merchant CTA (its click emits `cta:click`).
 */
export interface ResultStepProps {
  t: Translate;
  beforeUrl: string;
  resultUrl: string;
  resultCta: ResultCta | null;
  /** AI coverage estimate (#7) — present only for coverage products; drives the quantity stepper. */
  suggestedQuantity?: number;
  quantityRationale?: string;
  quantity?: number;
  onSetQuantity?: (quantity: number) => void;
  onSave: () => void;
  onShare: () => void;
  onRegenerate: () => void;
  onFeedback: (rating: FeedbackRating) => void;
  onCta: () => void;
}

export function ResultStep({
  t,
  beforeUrl,
  resultUrl,
  resultCta,
  suggestedQuantity,
  quantityRationale,
  quantity,
  onSetQuantity,
  onSave,
  onShare,
  onRegenerate,
  onFeedback,
  onCta,
}: ResultStepProps) {
  const [voted, setVoted] = useState(false);
  const qty = quantity ?? suggestedQuantity ?? 1;

  function vote(rating: FeedbackRating): void {
    onFeedback(rating);
    setVoted(true);
  }

  return (
    <div class="lumina-state lumina-result">
      <BeforeAfter
        beforeUrl={beforeUrl}
        resultUrl={resultUrl}
        beforeLabel={t('result.before')}
        afterLabel={t('result.after')}
      />
      <div class="lumina-feedback">
        {voted ? (
          <span class="lumina-feedback-thanks">✓ {t('feedback.thanks')}</span>
        ) : (
          <>
            <button class="lumina-vote" type="button" aria-label={t('feedback.up')} onClick={() => vote('up')}>
              <span aria-hidden="true">👍</span> {t('feedback.up')}
            </button>
            <button class="lumina-vote" type="button" aria-label={t('feedback.down')} onClick={() => vote('down')}>
              <span aria-hidden="true">👎</span> {t('feedback.down')}
            </button>
          </>
        )}
      </div>
      <div class="lumina-actions">
        <button class="lumina-act" type="button" onClick={onSave}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3v12M7 11l5 4 5-4" />
            <path d="M4 19h16" />
          </svg>
          <span>{t('result.save')}</span>
        </button>
        <button class="lumina-act" type="button" onClick={onShare}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="2.6" />
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="18" cy="19" r="2.6" />
            <path d="M8.3 10.8 15.7 6.4M8.3 13.2l7.4 4.4" />
          </svg>
          <span>{t('result.share')}</span>
        </button>
        <button class="lumina-act" type="button" onClick={onRegenerate}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span>{t('result.regenerate')}</span>
        </button>
      </div>
      {suggestedQuantity != null ? (
        <div class="lumina-estimate">
          <div class="lumina-estimate-head">
            <span class="lumina-estimate-label">
              {t('result.estimate', { qty: String(suggestedQuantity) })}
            </span>
            <div class="lumina-stepper">
              <button
                class="lumina-step"
                type="button"
                aria-label={t('result.less')}
                disabled={qty <= 1}
                onClick={() => onSetQuantity?.(qty - 1)}
              >
                −
              </button>
              <span class="lumina-step-val" aria-live="polite">
                {qty}
              </span>
              <button
                class="lumina-step"
                type="button"
                aria-label={t('result.more')}
                onClick={() => onSetQuantity?.(qty + 1)}
              >
                +
              </button>
            </div>
          </div>
          <p class="lumina-estimate-note">{quantityRationale ?? t('result.estimateNote')}</p>
        </div>
      ) : null}
      {resultCta ? (
        <button class="lumina-btn lumina-btn-primary lumina-cta" type="button" onClick={onCta}>
          {resultCta.label}
        </button>
      ) : null}
    </div>
  );
}

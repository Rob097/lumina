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
  onSave,
  onShare,
  onRegenerate,
  onFeedback,
  onCta,
}: ResultStepProps) {
  return (
    <div class="lumina-state lumina-result">
      <BeforeAfter
        beforeUrl={beforeUrl}
        resultUrl={resultUrl}
        beforeLabel={t('result.before')}
        afterLabel={t('result.after')}
      />
      <div class="lumina-feedback">
        <button class="lumina-chip" type="button" aria-label={t('feedback.up')} onClick={() => onFeedback('up')}>
          👍
        </button>
        <button class="lumina-chip" type="button" aria-label={t('feedback.down')} onClick={() => onFeedback('down')}>
          👎
        </button>
      </div>
      <div class="lumina-actions">
        <button class="lumina-btn" type="button" onClick={onSave}>
          {t('result.save')}
        </button>
        <button class="lumina-btn" type="button" onClick={onShare}>
          {t('result.share')}
        </button>
        <button class="lumina-btn" type="button" onClick={onRegenerate}>
          {t('result.regenerate')}
        </button>
      </div>
      {resultCta ? (
        <button class="lumina-btn lumina-btn-primary lumina-cta" type="button" onClick={onCta}>
          {resultCta.label}
        </button>
      ) : null}
    </div>
  );
}

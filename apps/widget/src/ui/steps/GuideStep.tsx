import type { WidgetGuide } from '@lumina/shared';
import type { Translate } from '../../core/i18n.js';

/**
 * Pre-upload guide (generic, any merchant): an instructional screen shown BEFORE the photo upload, with
 * merchant-defined image + optional title/body. Pure presentation — it carries no domain/fashion wording;
 * the copy comes verbatim from the merchant's config so a tiles shop or a fashion shop both fit. Shown in
 * the live widget (and the dashboard preview) only; the Studio never renders the widget steps.
 */
export interface GuideStepProps {
  t: Translate;
  guide: WidgetGuide;
  onContinue: () => void;
}

export function GuideStep({ t, guide, onContinue }: GuideStepProps) {
  return (
    <div class="lumina-state lumina-guide">
      {guide.title ? <h2 class="lumina-title">{guide.title}</h2> : null}
      <img
        class="lumina-guide-img"
        src={guide.imageUrl}
        alt=""
        loading="lazy"
        style="display:block;max-width:100%;max-height:46vh;width:auto;margin:0 auto;border-radius:var(--lumina-radius,12px)"
      />
      {guide.body ? <p class="lumina-muted lumina-guide-body">{guide.body}</p> : null}
      <button class="lumina-btn lumina-btn-primary" type="button" onClick={onContinue}>
        {t('guide.cta')}
      </button>
    </div>
  );
}

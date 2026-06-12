import type { GenerationStage } from '@lumina/shared';
import { stageStringKey, type Translate } from '../../core/i18n.js';

/** Generating state — calm progress + a stage hint keyed to the pipeline stage (§3). */
export interface GeneratingStepProps {
  t: Translate;
  stage?: GenerationStage;
  /** The shopper's room, shown dimmed behind the loader so the wait reads as "working on this". */
  roomPreviewUrl?: string;
}

export function GeneratingStep({ t, stage, roomPreviewUrl }: GeneratingStepProps) {
  return (
    <div class="lumina-state lumina-generating">
      {roomPreviewUrl ? (
        <img class="lumina-generating-bg" src={roomPreviewUrl} alt="" aria-hidden="true" />
      ) : null}
      <div class="lumina-generating-fg">
        <div class="lumina-spinner" aria-hidden="true" />
        <h2 class="lumina-title">{t('generating.title')}</h2>
        <p class="lumina-muted" aria-live="polite">
          {t(stage ? stageStringKey(stage) : 'stage.validate')}
        </p>
        <p class="lumina-muted lumina-generating-sub">{t('generating.subtitle')}</p>
      </div>
    </div>
  );
}

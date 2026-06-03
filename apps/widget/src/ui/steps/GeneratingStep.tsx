import type { GenerationStage } from '@lumina/shared';
import { stageStringKey, type Translate } from '../../core/i18n.js';

/** Generating state — calm progress + a stage hint keyed to the pipeline stage (§3). */
export interface GeneratingStepProps {
  t: Translate;
  stage?: GenerationStage;
}

export function GeneratingStep({ t, stage }: GeneratingStepProps) {
  return (
    <div class="lumina-state lumina-generating">
      <div class="lumina-spinner" aria-hidden="true" />
      <h2 class="lumina-title">{t('generating.title')}</h2>
      <p class="lumina-muted" aria-live="polite">
        {t(stage ? stageStringKey(stage) : 'stage.validate')}
      </p>
    </div>
  );
}

import type { Translate, StringKey } from '../../core/i18n.js';

/**
 * Step 2 — confirm the product + pick a placement hint (§3). The chips map to short English phrases fed
 * to the AI prompt; "Auto" sends an empty hint (let the model decide).
 */
const PLACEMENTS: Array<{ key: StringKey; hint: string }> = [
  { key: 'placement.auto', hint: '' },
  { key: 'placement.floor', hint: 'on the floor' },
  { key: 'placement.wall', hint: 'on the wall' },
  { key: 'placement.table', hint: 'on a table' },
  { key: 'placement.corner', hint: 'in the corner' },
];

export interface ConfirmStepProps {
  t: Translate;
  productName?: string;
  roomPreviewUrl?: string;
  activeHint?: string;
  onSetHint: (hint: string) => void;
  customInstructions?: string;
  onSetInstructions: (text: string) => void;
  onGenerate: () => void;
}

export function ConfirmStep({
  t,
  productName,
  roomPreviewUrl,
  activeHint,
  onSetHint,
  customInstructions,
  onSetInstructions,
  onGenerate,
}: ConfirmStepProps) {
  return (
    <div class="lumina-state lumina-confirm">
      <h2 class="lumina-title">{t('confirm.title', { product: productName ?? '' })}</h2>
      {roomPreviewUrl ? <img class="lumina-preview" src={roomPreviewUrl} alt="" /> : null}
      <p class="lumina-muted">{t('confirm.placementLabel')}</p>
      <div class="lumina-chips">
        {PLACEMENTS.map((p) => (
          <button
            key={p.key}
            type="button"
            class={`lumina-chip${(activeHint ?? '') === p.hint ? ' is-active' : ''}`}
            onClick={() => onSetHint(p.hint)}
          >
            {t(p.key)}
          </button>
        ))}
      </div>
      <label class="lumina-instructions">
        <span class="lumina-instructions-label">{t('confirm.instructions')}</span>
        <textarea
          class="lumina-instructions-input"
          rows={2}
          maxLength={280}
          placeholder={t('confirm.instructionsPlaceholder')}
          value={customInstructions ?? ''}
          onInput={(e) => onSetInstructions((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <button class="lumina-btn lumina-btn-primary" type="button" onClick={onGenerate}>
        {t('confirm.generate')}
      </button>
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import type { FeedbackRating } from '@lumina/shared';
import type { EffectiveConfig } from '../core/config.js';
import type { Translate } from '../core/i18n.js';
import { Modal } from './Modal.js';
import { UploadStep } from './steps/UploadStep.js';
import { ConfirmStep } from './steps/ConfirmStep.js';
import { GeneratingStep } from './steps/GeneratingStep.js';
import { ResultStep } from './steps/ResultStep.js';
import { ErrorState } from './steps/ErrorState.js';
import { initialState, type FlowState } from './state.js';

/** The controller surface the App renders against (LuminaController satisfies this). */
export interface AppController {
  subscribe(listener: (state: FlowState) => void): () => void;
  close(reason?: string): void;
  selectRoom(file: Blob, source: 'file' | 'camera'): unknown;
  setHint(hint: string): void;
  startGeneration(): unknown;
  regenerate(): unknown;
  save(): unknown;
  share(): unknown;
  sendFeedback(rating: FeedbackRating): unknown;
  ctaClick(): void;
}

export interface AppProps {
  controller: AppController;
  config: EffectiveConfig;
  t: Translate;
}

/** Top-level view: subscribes to the controller's flow state and routes the step component. */
export function App({ controller, config, t }: AppProps) {
  const [state, setState] = useState<FlowState>(initialState);
  useEffect(() => controller.subscribe(setState), [controller]);

  if (state.step === 'idle') return null;

  return (
    <Modal
      onClose={() => controller.close('user')}
      watermark={config.watermark}
      poweredByLabel={t('poweredBy')}
      closeLabel={t('close')}
      wide={state.step === 'result'}
    >
      {renderStep()}
    </Modal>
  );

  function renderStep() {
    switch (state.step) {
      case 'upload':
        return (
          <UploadStep
            t={t}
            limits={config.limits}
            onSelectRoom={(file, source) => controller.selectRoom(file, source)}
          />
        );
      case 'confirm':
        return (
          <ConfirmStep
            t={t}
            productName={state.opts?.product?.name}
            roomPreviewUrl={state.roomPreviewUrl}
            activeHint={state.placementHint}
            onSetHint={(hint) => controller.setHint(hint)}
            onGenerate={() => controller.startGeneration()}
          />
        );
      case 'generating':
        return <GeneratingStep t={t} stage={state.stage} roomPreviewUrl={state.roomPreviewUrl} />;
      case 'result':
        return (
          <ResultStep
            t={t}
            beforeUrl={state.beforeUrl ?? ''}
            resultUrl={state.resultUrl ?? ''}
            resultCta={config.resultCta}
            onSave={() => controller.save()}
            onShare={() => controller.share()}
            onRegenerate={() => controller.regenerate()}
            onFeedback={(rating) => controller.sendFeedback(rating)}
            onCta={() => controller.ctaClick()}
          />
        );
      case 'error':
        return <ErrorState t={t} code={state.error?.code} onRetry={() => controller.regenerate()} />;
      default:
        return null;
    }
  }
}

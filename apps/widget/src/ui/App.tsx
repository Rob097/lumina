import { useEffect, useState } from 'preact/hooks';
import type { FeedbackRating } from '@lumina/shared';
import type { EffectiveConfig } from '../core/config.js';
import type { Translate } from '../core/i18n.js';
import { Modal } from './Modal.js';
import { GuideStep } from './steps/GuideStep.js';
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
  setInstructions(text: string): void;
  setQuantity(quantity: number): void;
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
  // One-time pre-upload guide gate (a pure view-layer overlay, so the reducer/controller flow is untouched).
  // Reset on close so it shows again on the next open.
  const [guideDone, setGuideDone] = useState(false);
  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    if (state.step === 'idle') setGuideDone(false);
  }, [state.step]);

  if (state.step === 'idle') return null;

  const guide = config.guide;
  const showGuide =
    state.step === 'upload' && !guideDone && Boolean(guide?.enabled && guide?.imageUrl);

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
    // The configured guide precedes the upload step (shown once per open). It carries no controller state —
    // dismissing it just reveals the real UploadStep.
    if (showGuide && guide) {
      return <GuideStep t={t} guide={guide} onContinue={() => setGuideDone(true)} />;
    }
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
            customInstructions={state.customInstructions}
            onSetInstructions={(text) => controller.setInstructions(text)}
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
            suggestedQuantity={state.suggestedQuantity}
            quantityRationale={state.quantityRationale}
            quantity={state.quantity}
            onSetQuantity={(n) => controller.setQuantity(n)}
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

import type { ErrorCode, GenerationStage, OpenOptions } from '@lumina/shared';

/**
 * The modal's flow as a pure reducer (D23). The UI renders `state.step`; the controller drives
 * transitions. Illegal transitions are no-ops, so a late/stray event can never corrupt the view.
 */
export type Step = 'idle' | 'upload' | 'confirm' | 'generating' | 'result' | 'error';

export interface FlowState {
  step: Step;
  opts?: OpenOptions;
  roomPreviewUrl?: string;
  placementHint?: string;
  customInstructions?: string;
  generationId?: string;
  stage?: GenerationStage;
  resultUrl?: string;
  beforeUrl?: string;
  /** AI coverage estimate (#7): present only for coverage products. */
  suggestedQuantity?: number;
  quantityRationale?: string;
  /** The shopper's chosen quantity (the stepper value), seeded from `suggestedQuantity`. */
  quantity?: number;
  error?: { code: ErrorCode; message: string };
}

export type FlowAction =
  | { type: 'OPEN'; opts: OpenOptions }
  | { type: 'ROOM_SELECTED'; previewUrl?: string }
  | { type: 'SET_HINT'; hint: string }
  | { type: 'SET_INSTRUCTIONS'; text: string }
  | { type: 'GEN_SUBMIT' }
  | { type: 'GEN_START'; generationId: string }
  | { type: 'GEN_PROGRESS'; stage: GenerationStage }
  | {
      type: 'GEN_SUCCESS';
      resultUrl: string;
      beforeUrl: string;
      generationId?: string;
      suggestedQuantity?: number;
      quantityRationale?: string;
    }
  | { type: 'GEN_ERROR'; code: ErrorCode; message: string; generationId?: string }
  | { type: 'SET_QUANTITY'; quantity: number }
  | { type: 'REGENERATE' }
  | { type: 'CLOSE' };

export const initialState: FlowState = { step: 'idle' };

export function reduce(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'OPEN':
      return { step: 'upload', opts: action.opts };

    case 'ROOM_SELECTED':
      if (state.step !== 'upload') return state;
      return { ...state, step: 'confirm', roomPreviewUrl: action.previewUrl };

    case 'SET_HINT':
      if (state.step !== 'confirm') return state;
      return { ...state, placementHint: action.hint };

    case 'SET_INSTRUCTIONS':
      if (state.step !== 'confirm') return state;
      return { ...state, customInstructions: action.text };

    // Enter the loader the instant the shopper hits Generate — before the upload/POST round-trips —
    // so there's no window where the Generate button is still live (double-submit) or the confirm
    // step can be closed mid-flight.
    case 'GEN_SUBMIT':
      if (state.step !== 'confirm') return state;
      return { ...state, step: 'generating', stage: undefined, error: undefined };

    case 'GEN_START':
      // Reachable from confirm (direct) or generating (after GEN_SUBMIT) — just records the id.
      if (state.step !== 'confirm' && state.step !== 'generating') return state;
      return { ...state, step: 'generating', generationId: action.generationId, error: undefined };

    case 'GEN_PROGRESS':
      if (state.step !== 'generating') return state;
      return { ...state, stage: action.stage };

    case 'GEN_SUCCESS':
      if (state.step !== 'generating') return state;
      return {
        ...state,
        step: 'result',
        resultUrl: action.resultUrl,
        beforeUrl: action.beforeUrl,
        generationId: action.generationId ?? state.generationId,
        suggestedQuantity: action.suggestedQuantity,
        quantityRationale: action.quantityRationale,
        quantity: action.suggestedQuantity ?? 1,
      };

    case 'SET_QUANTITY':
      if (state.step !== 'result') return state;
      return { ...state, quantity: Math.max(1, Math.round(action.quantity)) };

    case 'GEN_ERROR':
      if (state.step === 'idle') return state;
      return {
        ...state,
        step: 'error',
        error: { code: action.code, message: action.message },
        generationId: action.generationId ?? state.generationId,
      };

    case 'REGENERATE':
      return {
        ...state,
        step: state.roomPreviewUrl ? 'confirm' : 'upload',
        resultUrl: undefined,
        beforeUrl: undefined,
        stage: undefined,
        error: undefined,
        generationId: undefined,
        suggestedQuantity: undefined,
        quantityRationale: undefined,
        quantity: undefined,
      };

    case 'CLOSE':
      return initialState;

    default:
      return state;
  }
}

import type {
  EventBeaconRequest,
  FeedbackRating,
  FeedbackRequest,
  GenerateRequest,
  GenerateResponse,
  OpenOptions,
  SignUploadResponse,
  StatusResponse,
  UsageEventType,
  ErrorCode,
} from '@lumina/shared';
import type { EffectiveConfig } from './config.js';
import type { Emitter } from './emitter.js';
import { ApiError } from './api.js';
import { processImage as defaultProcessImage, type ProcessedImage } from './image.js';
import { subscribeStatus, type StatusApi } from './status.js';
import { reduce, initialState, type FlowAction, type FlowState } from '../ui/state.js';

/**
 * The flow's orchestration heart (D23). It ties the effective config, the API client, the event
 * emitter, the status subscription, and the image pipeline to the pure flow reducer — and is the only
 * place that emits the public §3.6 events + the analytics beacons. The Preact UI just renders
 * `state` (via `subscribe`) and calls these methods. Every external dependency is injected so the whole
 * flow is unit-testable offline.
 */

/** The slice of the API client the controller calls. `ApiClient` satisfies this. */
export interface ControllerApi extends StatusApi {
  signUpload(contentType: string): Promise<SignUploadResponse>;
  putRoom(uploadUrl: string, blob: Blob, contentType: string): Promise<void>;
  generate(req: GenerateRequest, idempotencyKey?: string): Promise<GenerateResponse>;
  feedback(req: FeedbackRequest): Promise<void>;
  event(req: EventBeaconRequest): Promise<void>;
}

export interface ControllerDeps {
  config: EffectiveConfig;
  api: ControllerApi;
  emitter: Emitter;
  anonId: string;
  pageUrl?: string;
  processImage?: (file: Blob) => Promise<ProcessedImage>;
  watchStatus?: (id: string, onUpdate: (s: StatusResponse) => void) => () => void;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  saveImage?: (url: string, filename: string) => void | Promise<void>;
  shareFn?: (data: { url: string; title?: string }) => Promise<string>;
  reportError?: (error: unknown, context?: Record<string, unknown>) => void;
  /** How a result-CTA click opens its resolved URL (defaults to a new tab). */
  navigate?: (url: string) => void;
}

type Listener = (state: FlowState) => void;

export class LuminaController {
  state: FlowState = initialState;

  private readonly listeners = new Set<Listener>();
  private readonly previewUrls: string[] = [];
  private room?: { blob: Blob; contentType: string };
  private cancelWatch?: () => void;

  private readonly config: EffectiveConfig;
  private readonly api: ControllerApi;
  private readonly emitter: Emitter;
  private readonly anonId: string;
  private readonly pageUrl?: string;
  private readonly processImage: (file: Blob) => Promise<ProcessedImage>;
  private readonly watchStatus: (id: string, onUpdate: (s: StatusResponse) => void) => () => void;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly saveImage: (url: string, filename: string) => void | Promise<void>;
  private readonly shareFn: (data: { url: string; title?: string }) => Promise<string>;
  private readonly reportError: (error: unknown, context?: Record<string, unknown>) => void;
  private readonly navigate: (url: string) => void;

  constructor(deps: ControllerDeps) {
    this.config = deps.config;
    this.api = deps.api;
    this.emitter = deps.emitter;
    this.anonId = deps.anonId;
    this.pageUrl = deps.pageUrl;
    this.processImage = deps.processImage ?? defaultProcessImage;
    this.watchStatus =
      deps.watchStatus ?? ((id, onUpdate) => subscribeStatus(this.api, id, { onUpdate }));
    this.createObjectUrl = deps.createObjectUrl ?? ((b) => URL.createObjectURL(b));
    this.revokeObjectUrl = deps.revokeObjectUrl ?? ((u) => URL.revokeObjectURL(u));
    this.saveImage = deps.saveImage ?? defaultSaveImage;
    this.shareFn = deps.shareFn ?? defaultShare;
    this.reportError = deps.reportError ?? (() => {});
    this.navigate = deps.navigate ?? defaultNavigate;
  }

  /** Subscribe to flow-state changes (the UI). Fires immediately with the current state. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => void this.listeners.delete(listener);
  }

  open(opts: OpenOptions): void {
    this.dispatch({ type: 'OPEN', opts });
    this.emitter.emit('open', {
      productId: opts.productId,
      product: opts.product,
      metadata: opts.metadata,
    });
    this.beacon('open', { productId: opts.productId });
  }

  close(reason = 'user'): void {
    this.cancelWatch?.();
    this.cancelWatch = undefined;
    this.revokePreviews();
    this.dispatch({ type: 'CLOSE' });
    this.emitter.emit('close', { reason });
  }

  setHint(hint: string): void {
    this.dispatch({ type: 'SET_HINT', hint });
  }

  setInstructions(text: string): void {
    this.dispatch({ type: 'SET_INSTRUCTIONS', text });
  }

  setQuantity(quantity: number): void {
    this.dispatch({ type: 'SET_QUANTITY', quantity });
  }

  async selectRoom(file: Blob, source: 'file' | 'camera'): Promise<void> {
    this.emitter.emit('upload:start', { source });
    try {
      const processed = await this.processImage(file);
      if (processed.blob.size > this.config.limits.maxUploadBytes) {
        this.fail('unsupported_image', 'That image is too large.');
        return;
      }
      this.room = { blob: processed.blob, contentType: processed.contentType };
      const previewUrl = this.createObjectUrl(processed.blob);
      this.previewUrls.push(previewUrl);
      this.dispatch({ type: 'ROOM_SELECTED', previewUrl });
    } catch (error) {
      this.reportError(error, { stage: 'process_image' });
      this.fail('unsupported_image', 'We could not read that image.');
    }
  }

  async startGeneration(): Promise<void> {
    if (!this.room) return;
    // Ignore re-entry (rapid double-clicks): once we're submitting we're already in the loader.
    if (this.state.step === 'generating') return;
    // Show the loader immediately, before the sign-upload/PUT/POST round-trips (~5s).
    this.dispatch({ type: 'GEN_SUBMIT' });
    try {
      const upload: SignUploadResponse = await this.api.signUpload(this.room.contentType);
      await this.api.putRoom(upload.uploadUrl, this.room.blob, this.room.contentType);
      this.emitter.emit('upload:done', { roomKey: upload.roomKey });

      const res = await this.api.generate(this.buildRequest(upload.roomKey));
      this.dispatch({ type: 'GEN_START', generationId: res.generationId });
      this.emitter.emit('generate:start', { generationId: res.generationId });
      this.beacon('generate', { generationId: res.generationId });
      this.watch(res.generationId);
    } catch (error) {
      this.handleGenerateError(error);
    }
  }

  async regenerate(): Promise<void> {
    this.dispatch({ type: 'REGENERATE' });
    await this.startGeneration();
  }

  async sendFeedback(rating: FeedbackRating): Promise<void> {
    const generationId = this.state.generationId;
    if (!generationId) return;
    this.emitter.emit('feedback', { generationId, rating });
    this.beacon('feedback', { generationId, props: { rating } });
    try {
      await this.api.feedback({ generationId, rating });
    } catch (error) {
      this.reportError(error, { stage: 'feedback' });
    }
  }

  async save(): Promise<void> {
    const { resultUrl, generationId } = this.state;
    if (!resultUrl) return;
    await this.saveImage(resultUrl, `yuzuview-${generationId ?? 'result'}.jpg`);
    if (generationId) this.emitter.emit('result:save', { generationId });
  }

  async share(): Promise<void> {
    const { resultUrl, generationId } = this.state;
    if (!resultUrl) return;
    const channel = await this.shareFn({ url: resultUrl, title: 'My room' });
    if (generationId) this.emitter.emit('result:share', { generationId, channel });
  }

  ctaClick(): void {
    const opts = this.state.opts ?? {};
    this.emitter.emit('cta:click', { productId: opts.productId, metadata: opts.metadata });
    this.beacon('cta', { productId: opts.productId, generationId: this.state.generationId });
    // Actually open the merchant's configured CTA (e.g. add-to-cart). Merchants who prefer to handle
    // it themselves listen to `cta:click`; a configured `urlTemplate` is the default action.
    const template = this.config.resultCta?.urlTemplate;
    if (template) this.navigate(this.resolveCtaUrl(template));
  }

  /** Fill the CTA template's `{productId}`/`{productUrl}`/`{quantity}` tokens and resolve against the page. */
  private resolveCtaUrl(template: string): string {
    const productId = this.state.opts?.productId ?? '';
    const productUrl = this.pageUrl ?? '';
    const quantity = String(this.state.quantity ?? this.state.suggestedQuantity ?? 1);
    const filled = template
      .replace(/\{productId\}/g, encodeURIComponent(productId))
      .replace(/\{productUrl\}/g, productUrl)
      .replace(/\{quantity\}/g, encodeURIComponent(quantity));
    try {
      return new URL(filled, this.pageUrl || undefined).href;
    } catch {
      return filled;
    }
  }

  trackImpression(): void {
    this.beacon('impression');
  }

  // ---- internals -----------------------------------------------------------

  private dispatch(action: FlowAction): void {
    this.state = reduce(this.state, action);
    for (const listener of [...this.listeners]) listener(this.state);
  }

  private buildRequest(roomKey: string): GenerateRequest {
    const opts = this.state.opts ?? {};
    return {
      ...(opts.productId ? { productId: opts.productId } : {}),
      ...(opts.product ? { product: opts.product } : {}),
      roomKey,
      ...(this.state.placementHint ? { placementHint: this.state.placementHint } : {}),
      ...(this.state.customInstructions?.trim()
        ? { customInstructions: this.state.customInstructions.trim() }
        : {}),
      anonId: this.anonId,
      ...(this.pageUrl ? { pageUrl: this.pageUrl } : {}),
      ...(opts.metadata ? { metadata: opts.metadata } : {}),
    };
  }

  private watch(generationId: string): void {
    this.cancelWatch?.();
    this.cancelWatch = this.watchStatus(generationId, (s) => this.onStatus(s));
  }

  private onStatus(s: StatusResponse): void {
    if (s.status === 'succeeded' && s.resultUrl && s.beforeUrl) {
      this.dispatch({
        type: 'GEN_SUCCESS',
        resultUrl: s.resultUrl,
        beforeUrl: s.beforeUrl,
        generationId: s.id,
        ...(s.suggestedQuantity != null ? { suggestedQuantity: s.suggestedQuantity } : {}),
        ...(s.quantityRationale ? { quantityRationale: s.quantityRationale } : {}),
      });
      this.emitter.emit('generate:success', {
        generationId: s.id,
        resultUrl: s.resultUrl,
        beforeUrl: s.beforeUrl,
      });
      this.beacon('success', { generationId: s.id });
    } else if (s.status === 'failed' || s.status === 'refunded') {
      this.fail(s.error?.code ?? 'generation_failed', s.error?.message ?? 'Generation failed', s.id);
    } else if (s.stage) {
      this.dispatch({ type: 'GEN_PROGRESS', stage: s.stage });
      this.emitter.emit('generate:progress', { generationId: s.id, stage: s.stage });
    }
  }

  private handleGenerateError(error: unknown): void {
    if (error instanceof ApiError && error.isInsufficientCredits) {
      this.fail('insufficient_credits', error.message);
      return;
    }
    this.reportError(error, { stage: 'generate' });
    const code: ErrorCode = error instanceof ApiError ? error.code : 'generation_failed';
    const message = error instanceof Error ? error.message : 'Generation failed';
    this.fail(code, message);
  }

  private fail(code: ErrorCode, message: string, generationId?: string): void {
    this.dispatch({ type: 'GEN_ERROR', code, message, generationId });
    this.emitter.emit('generate:error', {
      generationId: generationId ?? this.state.generationId,
      code,
      message,
    });
  }

  private beacon(
    type: UsageEventType,
    extra: { productId?: string; generationId?: string; props?: Record<string, unknown> } = {},
  ): void {
    const req: EventBeaconRequest = { type, anonId: this.anonId, ...extra };
    void this.api.event(req).catch((error) => this.reportError(error, { stage: 'beacon' }));
  }

  private revokePreviews(): void {
    for (const url of this.previewUrls.splice(0)) {
      try {
        this.revokeObjectUrl(url);
      } catch {
        /* already revoked */
      }
    }
  }
}

function defaultNavigate(url: string): void {
  if (typeof window === 'undefined') return;
  // Open in a new tab so the shopper keeps their generated room/result while the cart updates.
  window.open(url, '_blank', 'noopener');
}

function defaultSaveImage(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function defaultShare(data: { url: string; title?: string }): Promise<string> {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      await nav.share({ title: data.title, url: data.url });
      return 'web-share';
    }
    if (nav?.clipboard) {
      await nav.clipboard.writeText(data.url);
      return 'clipboard';
    }
  } catch {
    /* user cancelled or unsupported */
  }
  return 'none';
}

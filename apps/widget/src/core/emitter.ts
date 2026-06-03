import type { InlineProduct, WidgetEventName } from '@lumina/shared';

/**
 * Typed event bus (§3.6). Every event is delivered to `on()` subscribers **and** mirrored as a
 * `window` CustomEvent named `lumina:<event>` (so GTM/analytics can listen on the DOM). Handler
 * errors are isolated and forwarded to `onError` (wired to Sentry reporting in Task 14) so one bad
 * merchant handler can't break the flow.
 */
export interface WidgetEventPayloads {
  ready: { version: string };
  open: { productId?: string; product?: InlineProduct; metadata?: Record<string, string> };
  close: { reason: string };
  'upload:start': { source: 'file' | 'camera' };
  'upload:done': { roomKey: string };
  'generate:start': { generationId: string };
  'generate:progress': { generationId: string; stage: string };
  'generate:success': { generationId: string; resultUrl: string; beforeUrl: string };
  'generate:error': { generationId?: string; code: string; message: string };
  'result:save': { generationId: string };
  'result:share': { generationId: string; channel: string };
  feedback: { generationId: string; rating: 'up' | 'down' };
  'cta:click': { productId?: string; metadata?: Record<string, string> };
}

export type WidgetHandler<K extends WidgetEventName> = (payload: WidgetEventPayloads[K]) => void;
type StoredHandler = (payload: never) => void;

export interface EmitterOptions {
  /** Where to dispatch the mirrored CustomEvents; `null` disables DOM mirroring (unit tests). */
  win?: Pick<Window, 'dispatchEvent'> | null;
  onError?: (error: unknown, event: WidgetEventName) => void;
}

export class Emitter {
  private readonly handlers = new Map<WidgetEventName, Set<StoredHandler>>();
  private readonly win: Pick<Window, 'dispatchEvent'> | null;
  private readonly onError: (error: unknown, event: WidgetEventName) => void;

  constructor(options: EmitterOptions = {}) {
    this.win =
      options.win === undefined ? (typeof window !== 'undefined' ? window : null) : options.win;
    this.onError = options.onError ?? (() => {});
  }

  on<K extends WidgetEventName>(name: K, handler: WidgetHandler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as StoredHandler);
    return () => this.off(name, handler);
  }

  off<K extends WidgetEventName>(name: K, handler: WidgetHandler<K>): void {
    this.handlers.get(name)?.delete(handler as StoredHandler);
  }

  emit<K extends WidgetEventName>(name: K, payload: WidgetEventPayloads[K]): void {
    const set = this.handlers.get(name);
    if (set) {
      // Iterate a copy so handlers that subscribe/unsubscribe during dispatch are safe.
      for (const handler of [...set]) {
        try {
          (handler as WidgetHandler<K>)(payload);
        } catch (error) {
          this.onError(error, name);
        }
      }
    }
    if (this.win) {
      try {
        this.win.dispatchEvent(new CustomEvent(`lumina:${name}`, { detail: payload }));
      } catch (error) {
        this.onError(error, name);
      }
    }
  }
}

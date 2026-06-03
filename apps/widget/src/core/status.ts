import type { GenerationStatus, StatusResponse } from '@lumina/shared';

/**
 * Generation status subscription (D21). The in-bundle transport polls `GET /widget/status/:id` with
 * capped exponential backoff until a terminal status. `StatusTransport` is the seam where a Supabase
 * Realtime transport can be lazy-loaded later without touching the controller — polling is primary so
 * the bundle stays under the < 45 KB budget (HARD RULE #7).
 */

/** The slice of the API client the transport needs. `ApiClient` satisfies this. */
export interface StatusApi {
  status(id: string): Promise<StatusResponse>;
}

export interface StatusSubscription {
  onUpdate: (status: StatusResponse) => void;
  signal?: AbortSignal;
}

export interface StatusTransport {
  /** Begin watching `id`; returns a cancel function. */
  subscribe(id: string, sub: StatusSubscription): () => void;
}

export interface PollingOptions {
  baseMs?: number;
  factor?: number;
  capMs?: number;
}

const TERMINAL = new Set<GenerationStatus>(['succeeded', 'failed', 'refunded']);

/** Polling transport with capped exponential backoff (default 500ms → ×1.5 → 4s). */
export function pollingTransport(api: StatusApi, options: PollingOptions = {}): StatusTransport {
  const base = options.baseMs ?? 500;
  const factor = options.factor ?? 1.5;
  const cap = options.capMs ?? 4000;

  return {
    subscribe(id, { onUpdate, signal }) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancelled = false;
      let delay = base;

      const cancel = (): void => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };

      const scheduleNext = (): void => {
        if (cancelled) return;
        timer = setTimeout(() => void tick(), delay);
        delay = Math.min(Math.round(delay * factor), cap);
      };

      const tick = async (): Promise<void> => {
        if (cancelled) return;
        let status: StatusResponse;
        try {
          status = await api.status(id);
        } catch {
          scheduleNext(); // transient error — keep polling
          return;
        }
        if (cancelled) return;
        onUpdate(status);
        if (TERMINAL.has(status.status)) {
          cancel();
          return;
        }
        scheduleNext();
      };

      if (signal) {
        if (signal.aborted) return () => {};
        signal.addEventListener('abort', cancel, { once: true });
      }

      timer = setTimeout(() => void tick(), 0); // kick off the first poll
      return cancel;
    },
  };
}

export interface SubscribeOptions extends StatusSubscription {
  /** Override the transport (the D21 seam for a future Realtime transport). */
  transport?: StatusTransport;
}

/** Subscribe to a generation's status; returns a cancel function. */
export function subscribeStatus(
  api: StatusApi,
  id: string,
  options: SubscribeOptions,
): () => void {
  const transport = options.transport ?? pollingTransport(api);
  return transport.subscribe(id, { onUpdate: options.onUpdate, signal: options.signal });
}

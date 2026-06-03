import type { LuminaConfig, OpenOptions, WidgetEventName } from '@lumina/shared';
import type { Emitter, WidgetHandler } from './emitter.js';

/**
 * The public `window.Lumina` surface (§3.4). It boots a session lazily (fetch remote config → build the
 * controller + Shadow-DOM UI, supplied by `deps.boot`) and is idempotent: `init` fetches once and emits
 * `ready` once. `installQueue` drains the loader's pre-load command queue (the Segment/GA pattern) so
 * `init`/`open` calls made before the app bundle arrived still run, in order.
 */

/** What a booted session exposes back to the public surface. */
export interface LuminaSession {
  controller: { open(opts: OpenOptions): void; close(reason?: string): void };
  applyConfig: (partial: Partial<LuminaConfig>) => void;
}

export interface CreateLuminaDeps {
  version: string;
  emitter: Emitter;
  /** Fetch remote config, build the controller + UI, and return the session. Called at most once. */
  boot: (config: LuminaConfig) => Promise<LuminaSession>;
}

export interface LuminaApi {
  version: string;
  init(config: LuminaConfig): void;
  open(opts: OpenOptions): Promise<void>;
  close(): void;
  configure(partial: Partial<LuminaConfig>): void;
  on<K extends WidgetEventName>(name: K, handler: WidgetHandler<K>): () => void;
  off<K extends WidgetEventName>(name: K, handler: WidgetHandler<K>): void;
  preload(): void;
}

export function createLumina(deps: CreateLuminaDeps): LuminaApi {
  let localConfig: LuminaConfig | undefined;
  let sessionPromise: Promise<LuminaSession> | undefined;
  let ready = false;

  const ensureSession = (): Promise<LuminaSession> | undefined => {
    if (!localConfig) return undefined;
    if (!sessionPromise) {
      const cfg = localConfig;
      sessionPromise = deps.boot(cfg).then((session) => {
        if (!ready) {
          ready = true;
          deps.emitter.emit('ready', { version: deps.version });
          cfg.onReady?.();
        }
        return session;
      });
    }
    return sessionPromise;
  };

  const configure = (partial: Partial<LuminaConfig>): void => {
    localConfig = { ...(localConfig ?? {}), ...partial } as LuminaConfig;
    if (sessionPromise) void sessionPromise.then((s) => s.applyConfig(partial));
  };

  const init = (config: LuminaConfig): void => {
    if (localConfig) {
      configure(config); // already initialized — treat as a runtime reconfigure
      return;
    }
    localConfig = config;
    void ensureSession();
  };

  const open = async (opts: OpenOptions): Promise<void> => {
    const session = ensureSession();
    if (!session) return; // not initialized — nothing to open
    (await session).controller.open(opts);
  };

  const close = (): void => {
    if (sessionPromise) void sessionPromise.then((s) => s.controller.close());
  };

  const preload = (): void => {
    void ensureSession();
  };

  return {
    version: deps.version,
    init,
    open,
    close,
    configure,
    preload,
    on<K extends WidgetEventName>(name: K, handler: WidgetHandler<K>) {
      return deps.emitter.on(name, handler);
    },
    off<K extends WidgetEventName>(name: K, handler: WidgetHandler<K>) {
      deps.emitter.off(name, handler);
    },
  };
}

interface QueueHost {
  Lumina?: unknown;
}

/** Replace the loader's `window.Lumina` stub with the real API and replay its buffered command queue. */
export function installQueue(win: QueueHost, api: LuminaApi): void {
  const existing = win.Lumina as { q?: unknown[] } | undefined;
  const queued = existing && Array.isArray(existing.q) ? existing.q : [];
  win.Lumina = api;

  const surface = api as unknown as Record<string, unknown>;
  for (const entry of queued) {
    if (!Array.isArray(entry) || entry.length === 0) continue;
    const [method, ...args] = entry as [string, ...unknown[]];
    const fn = surface[method];
    if (typeof fn === 'function') (fn as (...a: unknown[]) => unknown).apply(api, args);
  }
}

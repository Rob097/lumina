/**
 * The 2-file loader's logic (§3.2), kept separate from the `loader.ts` entry so it can be unit-tested
 * without the module auto-running. The loader: (1) creates the `window.Lumina` command-queue stub,
 * (2) auto-inits from `data-site-key`, (3) injects the content-hashed app bundle once, and
 * (4) buffers declarative-trigger clicks until the app boots (after which the app's own binder takes
 * over — detected via `window.Lumina.version`). It must stay tiny (~2 KB), so it has **no** imports
 * (the zod-based `parseTrigger` lives in the app bundle); it reads trigger attributes into a plain
 * object and lets the app validate on replay. It touches no host globals beyond `window.Lumina`.
 */
export interface LoaderWindow {
  Lumina?: unknown;
}

interface LoaderStub {
  q: unknown[];
  open(opts: unknown): void;
  init(config: unknown): void;
}

const METHODS = ['init', 'open', 'close', 'configure', 'preload', 'on', 'off'] as const;

function ensureStub(win: LoaderWindow): LoaderStub {
  const existing = win.Lumina as ({ q?: unknown[] } & Record<string, unknown>) | undefined;
  const q: unknown[] = existing && Array.isArray(existing.q) ? existing.q : [];
  const stub: Record<string, unknown> = existing ?? {};
  stub.q = q;
  for (const method of METHODS) {
    if (typeof stub[method] !== 'function') {
      stub[method] = (...args: unknown[]): void => void q.push([method, ...args]);
    }
  }
  win.Lumina = stub;
  return stub as unknown as LoaderStub;
}

function isBooted(win: LoaderWindow): boolean {
  return typeof (win.Lumina as { version?: unknown } | undefined)?.version === 'string';
}

function injectBundle(doc: Document, appUrl: string): void {
  if (doc.querySelector('script[data-lumina-app]')) return;
  const script = doc.createElement('script');
  script.async = true;
  script.src = appUrl;
  script.setAttribute('data-lumina-app', '');
  (doc.head ?? doc.documentElement).appendChild(script);
}

/** Find the loader's own `<script>` tag (carries `data-site-key`). */
export function resolveScript(doc: Document): Element | null {
  return doc.currentScript ?? doc.querySelector('script[data-site-key]');
}

/** Dependency-free trigger read (the app re-validates with zod on replay). Returns null if unusable. */
function readTrigger(el: Element): Record<string, unknown> | null {
  const productId = el.getAttribute('data-lumina-product');
  const name = el.getAttribute('data-lumina-product-name');
  const imageUrl = el.getAttribute('data-lumina-product-image');
  const category = el.getAttribute('data-lumina-category');
  const locale = el.getAttribute('data-lumina-locale');

  const opts: Record<string, unknown> = {};
  if (productId) opts.productId = productId;
  if (name && imageUrl) opts.product = { name, imageUrl, ...(category ? { category } : {}) };
  if (locale) opts.metadata = { locale };
  return opts.productId || opts.product ? opts : null;
}

export interface LoaderEnv {
  win: LoaderWindow;
  doc: Document;
  script: Element | null;
  appUrl: string;
}

/** Boot the loader. Returns a disposer that removes the pre-boot click listener (used by tests). */
export function bootLoader(env: LoaderEnv): () => void {
  const { win, doc, script, appUrl } = env;
  const stub = ensureStub(win);

  const mode = script?.getAttribute('data-lumina-mode') === 'manual' ? 'manual' : 'auto';
  const siteKey = script?.getAttribute('data-site-key') ?? undefined;
  const locale = script?.getAttribute('data-lumina-locale') ?? undefined;
  if (siteKey) {
    stub.init({ siteKey, ...(locale ? { locale } : {}) });
  }

  injectBundle(doc, appUrl);

  if (mode === 'manual') return () => {};

  const onClick = (event: Event): void => {
    if (isBooted(win)) return; // app loaded — its binder owns clicks now
    const target = event.target as Element | null;
    const trigger = target && typeof target.closest === 'function' ? target.closest('[data-lumina-trigger]') : null;
    if (!trigger) return;
    const opts = readTrigger(trigger);
    if (opts) {
      event.preventDefault();
      stub.open(opts);
    }
  };

  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}

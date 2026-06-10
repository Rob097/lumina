import type { OpenOptions } from '@lumina/shared';
import { parseTrigger } from './triggers.js';

/**
 * Styled launcher button (§3.3). A merchant drops an empty `[data-lumina-button]` placeholder where
 * they want the "Try in your room" button; we render LUMINA's branded button into it inside its **own
 * Shadow root** (HARD RULE #7 — styles never leak in or out). Product context comes from the same
 * `data-lumina-*` attributes the declarative triggers use. Merchant-owned `[data-lumina-trigger]`
 * elements are left alone (the binder just wires their click).
 */
export interface LauncherDeps {
  doc: Document;
  onOpen: (opts: OpenOptions) => void;
  /** Localized button label, e.g. `translate('button.try')`. */
  label: string;
  /** Theme CSS custom properties (from `themeVars`) applied to the button. */
  theme: Record<string, string>;
  mode?: 'auto' | 'manual';
}

const SELECTOR = '[data-lumina-button]';

const STYLES = `:host{all:initial}
.lumina-launcher{display:inline-flex;align-items:center;gap:8px;box-sizing:border-box;
  font-family:var(--lumina-font,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif);
  font-size:15px;font-weight:600;line-height:1;padding:12px 18px;border:0;cursor:pointer;
  border-radius:var(--lumina-radius,16px);background:var(--lumina-accent,#0F62FE);color:#fff;
  box-shadow:0 2px 8px rgba(0,0,0,.16);transition:filter .15s ease,transform .1s ease;
  -webkit-font-smoothing:antialiased}
.lumina-launcher:hover{filter:brightness(1.06)}
.lumina-launcher:active{transform:translateY(1px)}
.lumina-launcher:focus-visible{outline:2px solid var(--lumina-accent,#0F62FE);outline-offset:2px}
.lumina-launcher svg{width:18px;height:18px;flex:none}`;

const ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/></svg>';

const mounted = new WeakSet<Element>();

function renderInto(el: HTMLElement, deps: LauncherDeps): void {
  if (mounted.has(el) || el.shadowRoot) return;
  // No resolvable product → nothing to open; leave the placeholder empty.
  if (!parseTrigger(el)) return;
  mounted.add(el);

  const shadow = el.attachShadow({ mode: 'open' });
  const style = deps.doc.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  const button = deps.doc.createElement('button');
  button.type = 'button';
  button.className = 'lumina-launcher';
  button.setAttribute('aria-label', deps.label);
  for (const [key, value] of Object.entries(deps.theme)) button.style.setProperty(key, value);
  button.innerHTML = ICON;
  const span = deps.doc.createElement('span');
  span.textContent = deps.label;
  button.appendChild(span);
  // Re-parse on click so late attribute changes (SPA) are respected.
  button.addEventListener('click', () => {
    const opts = parseTrigger(el);
    if (opts) deps.onOpen(opts);
  });
  shadow.appendChild(button);
}

/** Render the launcher into every placeholder and observe the DOM for ones added later (SPA grids). */
export function mountLaunchers(deps: LauncherDeps): () => void {
  if (deps.mode === 'manual') return () => {};
  const { doc } = deps;
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(SELECTOR))) renderInto(el, deps);

  let observer: MutationObserver | undefined;
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (el.matches?.(SELECTOR)) renderInto(el as HTMLElement, deps);
          el.querySelectorAll?.(SELECTOR).forEach((n) => renderInto(n as HTMLElement, deps));
        }
      }
    });
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  }
  return () => observer?.disconnect();
}

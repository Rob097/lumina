import type { OpenOptions } from '@lumina/shared';
import { parseTrigger } from './triggers.js';

/**
 * Declarative install (§3.3/§3.5). Binds `[data-lumina-trigger]` elements through **event delegation**
 * on the document, so it works with SPA / infinite-scroll grids without rebinding. A `MutationObserver`
 * additionally warms the session (preload) as soon as a trigger appears. `manual` mode binds nothing.
 */
export interface BinderDeps {
  doc: Document;
  onOpen: (opts: OpenOptions) => void;
  onPreload: () => void;
  mode?: 'auto' | 'manual';
}

const SELECTOR = '[data-lumina-trigger]';

function closestTrigger(target: EventTarget | null): Element | null {
  const el = target as Element | null;
  return el && typeof el.closest === 'function' ? el.closest(SELECTOR) : null;
}

/** Begin auto-binding triggers; returns a disposer that removes the listeners + observer. */
export function bindTriggers(deps: BinderDeps): () => void {
  if (deps.mode === 'manual') return () => {};
  const { doc, onOpen, onPreload } = deps;

  const onClick = (event: Event): void => {
    const trigger = closestTrigger(event.target);
    if (!trigger) return;
    const opts = parseTrigger(trigger);
    if (opts) {
      event.preventDefault();
      onOpen(opts);
    }
  };

  const onOver = (event: Event): void => {
    if (closestTrigger(event.target)) onPreload();
  };

  doc.addEventListener('click', onClick);
  doc.addEventListener('mouseover', onOver);

  let observer: MutationObserver | undefined;
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (el.matches?.(SELECTOR) || el.querySelector?.(SELECTOR)) {
            onPreload();
            return;
          }
        }
      }
    });
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  }

  return () => {
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('mouseover', onOver);
    observer?.disconnect();
  };
}

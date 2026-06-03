import { render, type ComponentChild } from 'preact';

/**
 * Shadow-DOM mounting + focus trap (HARD RULE #7: all UI inside a Shadow root, styles scoped). The host
 * lives at the end of `<body>` with an open shadow root holding a scoped `<style>` and a themed
 * container that Preact renders into.
 */
export interface ShadowMount {
  host: HTMLElement;
  root: ShadowRoot;
  render(vnode: ComponentChild): void;
  unmount(): void;
}

export function createShadowMount(
  doc: Document,
  opts: { theme: Record<string, string>; styles: string },
): ShadowMount {
  const host = doc.createElement('div');
  host.setAttribute('data-lumina-root', '');
  const root = host.attachShadow({ mode: 'open' });

  const style = doc.createElement('style');
  style.textContent = opts.styles;
  root.appendChild(style);

  const container = doc.createElement('div');
  container.setAttribute('data-lumina-container', '');
  for (const [key, value] of Object.entries(opts.theme)) container.style.setProperty(key, value);
  root.appendChild(container);

  doc.body.appendChild(host);

  return {
    host,
    root,
    render: (vnode) => render(vnode, container),
    unmount: () => {
      render(null, container);
      host.remove();
    },
  };
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Trap Tab focus within `container` and route Escape to `onEscape`. Returns a disposer. */
export function trapFocus(container: HTMLElement, opts: { onEscape?: () => void } = {}): () => void {
  const handler = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      opts.onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;

    const rootNode = container.getRootNode() as Document | ShadowRoot;
    const active = rootNode.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', handler as EventListener);
  return () => container.removeEventListener('keydown', handler as EventListener);
}

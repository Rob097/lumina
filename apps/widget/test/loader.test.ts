import { describe, it, expect, afterEach } from 'vitest';
import { bootLoader, type LoaderWindow } from '../src/core/loader-core.js';

const APP = 'https://cdn.test/widget.abc.js';
const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.innerHTML = '';
  document.querySelectorAll('script[data-lumina-app]').forEach((s) => s.remove());
});

function scriptTag(attrs: Record<string, string>): HTMLScriptElement {
  const el = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function boot(script: HTMLScriptElement): { win: LoaderWindow & { Lumina?: { q: unknown[] } } } {
  const win: LoaderWindow = {};
  disposers.push(bootLoader({ win, doc: document, script, appUrl: APP }));
  return { win: win as LoaderWindow & { Lumina?: { q: unknown[] } } };
}

describe('bootLoader', () => {
  it('creates the queue stub and auto-inits from data-site-key', () => {
    const { win } = boot(scriptTag({ 'data-site-key': 'pk_test_1' }));
    const lumina = win.Lumina as { q: unknown[]; open: (o: unknown) => void };
    expect(lumina.q).toContainEqual(['init', { siteKey: 'pk_test_1' }]);

    lumina.open({ productId: 'X' });
    expect(lumina.q).toContainEqual(['open', { productId: 'X' }]);
  });

  it('injects the app bundle exactly once', () => {
    const script = scriptTag({ 'data-site-key': 'pk' });
    boot(script);
    boot(script); // a second boot must not inject a duplicate
    const tags = document.querySelectorAll('script[data-lumina-app]');
    expect(tags.length).toBe(1);
    expect((tags[0] as HTMLScriptElement).src).toContain('widget.abc.js');
  });

  it('queues an open from a delegated trigger click before boot', () => {
    const { win } = boot(scriptTag({ 'data-site-key': 'pk' }));
    const trigger = document.createElement('button');
    trigger.setAttribute('data-lumina-trigger', '');
    trigger.setAttribute('data-lumina-product', 'SKU-9');
    document.body.appendChild(trigger);

    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(win.Lumina?.q).toContainEqual(['open', expect.objectContaining({ productId: 'SKU-9' })]);
  });

  it('does not bind delegated clicks in manual mode', () => {
    const { win } = boot(scriptTag({ 'data-site-key': 'pk', 'data-lumina-mode': 'manual' }));
    const trigger = document.createElement('button');
    trigger.setAttribute('data-lumina-trigger', '');
    trigger.setAttribute('data-lumina-product', 'SKU-9');
    document.body.appendChild(trigger);

    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const queuedOpen = win.Lumina?.q.some((e) => Array.isArray(e) && e[0] === 'open');
    expect(queuedOpen).toBe(false);
  });
});

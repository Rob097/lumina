import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountLaunchers } from '../src/core/launcher.js';

afterEach(() => {
  document.body.innerHTML = '';
});

function placeholder(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe('mountLaunchers', () => {
  it('renders a styled button (in a shadow root) into a placeholder and opens its product on click', () => {
    const ph = placeholder('<div data-lumina-button data-lumina-product="P-01"></div>');
    const onOpen = vi.fn();

    mountLaunchers({
      doc: document,
      onOpen,
      label: 'Try in your room',
      theme: { '--lumina-accent': '#123456' },
    });

    const btn = ph.shadowRoot?.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toContain('Try in your room');

    btn?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ productId: 'P-01' }));
  });

  it('is idempotent — mounting twice yields a single button', () => {
    const ph = placeholder('<div data-lumina-button data-lumina-product="P-01"></div>');
    const onOpen = vi.fn();

    mountLaunchers({ doc: document, onOpen, label: 'X', theme: {} });
    mountLaunchers({ doc: document, onOpen, label: 'X', theme: {} });

    expect(ph.shadowRoot?.querySelectorAll('button').length).toBe(1);
  });

  it('leaves a merchant-owned [data-lumina-trigger] element untouched (no shadow injected)', () => {
    const own = placeholder('<button data-lumina-trigger data-lumina-product="P-01">Mine</button>');
    mountLaunchers({ doc: document, onOpen: vi.fn(), label: 'X', theme: {} });
    expect(own.shadowRoot).toBeNull();
  });

  it('skips a placeholder with no resolvable product', () => {
    const ph = placeholder('<div data-lumina-button></div>');
    mountLaunchers({ doc: document, onOpen: vi.fn(), label: 'X', theme: {} });
    expect(ph.shadowRoot?.querySelector('button') ?? null).toBeNull();
  });
});

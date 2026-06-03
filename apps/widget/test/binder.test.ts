import { describe, it, expect, vi, afterEach } from 'vitest';
import type { OpenOptions } from '@lumina/shared';
import { bindTriggers } from '../src/core/binder.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  document.body.innerHTML = '';
  while (cleanups.length) cleanups.pop()?.();
});

function bind(mode: 'auto' | 'manual' = 'auto') {
  const onOpen = vi.fn<(opts: OpenOptions) => void>();
  const onPreload = vi.fn();
  const dispose = bindTriggers({ doc: document, onOpen, onPreload, mode });
  cleanups.push(dispose);
  return { onOpen, onPreload };
}

function addTrigger(attrs: Record<string, string>): HTMLButtonElement {
  const el = document.createElement('button');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.setAttribute('data-lumina-trigger', '');
  document.body.appendChild(el);
  return el;
}

describe('bindTriggers', () => {
  it('opens with parsed options when a trigger is clicked (delegated)', () => {
    const { onOpen } = bind();
    const el = addTrigger({ 'data-lumina-product': 'SKU-1' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ productId: 'SKU-1' }));
  });

  it('preloads on hover over a trigger', () => {
    const { onPreload } = bind();
    const el = addTrigger({ 'data-lumina-product': 'SKU-1' });
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(onPreload).toHaveBeenCalled();
  });

  it('handles triggers added after binding (SPA / infinite scroll)', () => {
    const { onOpen } = bind();
    const el = addTrigger({ 'data-lumina-product': 'LATE' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ productId: 'LATE' }));
  });

  it('does nothing in manual mode', () => {
    const { onOpen } = bind('manual');
    const el = addTrigger({ 'data-lumina-product': 'SKU-1' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

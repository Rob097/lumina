import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, type ComponentChild } from 'preact';
import { h } from 'preact';
import type { WidgetLimits } from '@lumina/shared';
import { createTranslator } from '../src/core/i18n.js';
import { validateUpload, UploadStep } from '../src/ui/steps/UploadStep.js';
import { ResultStep } from '../src/ui/steps/ResultStep.js';
import { ErrorState, errorKey } from '../src/ui/steps/ErrorState.js';

const t = createTranslator('en');
const limits: WidgetLimits = { anonDailyCap: 5, maxUploadBytes: 1_000_000, maxImageEdgePx: 2048 };

const containers: HTMLElement[] = [];
afterEach(() => {
  while (containers.length) {
    const c = containers.pop();
    if (c) {
      render(null, c);
      c.remove();
    }
  }
});

function mount(vnode: ComponentChild): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(vnode, container);
  containers.push(container);
  return container;
}

function fileOfSize(bytes: number, type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], 'room.jpg', { type });
}

describe('validateUpload', () => {
  it('accepts an in-budget image and rejects over-cap or non-image files', () => {
    expect(validateUpload({ size: 500_000, type: 'image/jpeg' }, limits)).toBeNull();
    expect(validateUpload({ size: 2_000_000, type: 'image/jpeg' }, limits)?.reason).toBe('too_large');
    expect(validateUpload({ size: 100, type: 'application/pdf' }, limits)?.reason).toBe('not_image');
  });
});

describe('UploadStep', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('rejects an over-cap file (shows bad-image copy) and accepts a valid one', async () => {
    const onSelectRoom = vi.fn();
    const el = mount(h(UploadStep, { t, limits, onSelectRoom }));
    const input = el.querySelector('input[type=file]') as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [fileOfSize(2_000_000)], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(); // flush Preact's batched re-render
    expect(onSelectRoom).not.toHaveBeenCalled();
    expect(el.textContent).toContain(t('error.bad_image.body'));

    const ok = fileOfSize(500_000);
    Object.defineProperty(input, 'files', { value: [ok], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(onSelectRoom).toHaveBeenCalledWith(ok, 'file');
  });
});

describe('ResultStep', () => {
  it('renders the CTA and routes its click to onCta', () => {
    const onCta = vi.fn();
    const onFeedback = vi.fn();
    const el = mount(
      h(ResultStep, {
        t,
        beforeUrl: 'b',
        resultUrl: 'r',
        resultCta: { label: 'Add to cart', urlTemplate: 'https://shop/{id}' },
        onSave: vi.fn(),
        onShare: vi.fn(),
        onRegenerate: vi.fn(),
        onFeedback,
        onCta,
      }),
    );
    const cta = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Add to cart');
    cta?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCta).toHaveBeenCalledOnce();

    const up = el.querySelector('button[aria-label="Looks great"]') as HTMLButtonElement;
    up.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onFeedback).toHaveBeenCalledWith('up');
  });
});

describe('ErrorState', () => {
  it('maps each error code to the right localized copy', () => {
    expect(errorKey('insufficient_credits')).toBe('out_of_credits');
    expect(errorKey('unsupported_image')).toBe('bad_image');
    expect(errorKey('generation_failed')).toBe('failed');

    const el = mount(h(ErrorState, { t, code: 'insufficient_credits', onRetry: vi.fn() }));
    expect(el.textContent).toContain(t('error.out_of_credits.title'));
  });
});

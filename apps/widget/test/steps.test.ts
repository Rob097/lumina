import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, type ComponentChild } from 'preact';
import { h } from 'preact';
import type { WidgetLimits } from '@lumina/shared';
import { createTranslator } from '../src/core/i18n.js';
import { validateUpload, UploadStep } from '../src/ui/steps/UploadStep.js';
import { ConfirmStep } from '../src/ui/steps/ConfirmStep.js';
import { GeneratingStep } from '../src/ui/steps/GeneratingStep.js';
import { ResultStep } from '../src/ui/steps/ResultStep.js';
import { ErrorState, errorKey } from '../src/ui/steps/ErrorState.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

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

describe('ConfirmStep', () => {
  it('shows the custom-instructions textarea expanded (no collapse) and reports typing', () => {
    const onSetInstructions = vi.fn();
    const el = mount(
      h(ConfirmStep, {
        t,
        productName: 'Aura Lamp',
        onSetHint: vi.fn(),
        onSetInstructions,
        onGenerate: vi.fn(),
      }),
    );
    // The field must be visible immediately, not hidden behind a <details> disclosure.
    expect(el.querySelector('details')).toBeNull();
    const ta = el.querySelector('textarea.lumina-instructions-input') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    ta.value = 'near the window';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onSetInstructions).toHaveBeenCalledWith('near the window');
  });
});

describe('GeneratingStep', () => {
  it('sets the 1–2 minute expectation while composing', () => {
    const el = mount(h(GeneratingStep, { t }));
    expect(el.textContent).toContain(t('generating.subtitle'));
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

  it('confirms a vote: hides the thumbs and thanks the shopper', async () => {
    const onFeedback = vi.fn();
    const el = mount(
      h(ResultStep, {
        t,
        beforeUrl: 'b',
        resultUrl: 'r',
        resultCta: null,
        onSave: vi.fn(),
        onShare: vi.fn(),
        onRegenerate: vi.fn(),
        onFeedback,
        onCta: vi.fn(),
      }),
    );
    const down = el.querySelector('button[aria-label="Not quite"]') as HTMLButtonElement;
    down.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick(); // flush Preact's batched re-render
    expect(onFeedback).toHaveBeenCalledWith('down');
    expect(el.querySelector('button[aria-label="Not quite"]')).toBeNull();
    expect(el.querySelector('button[aria-label="Looks great"]')).toBeNull();
    expect(el.textContent).toContain(t('feedback.thanks'));
  });

  it('shows the AI coverage estimate + a working stepper, routed to onSetQuantity (#7)', () => {
    const onSetQuantity = vi.fn();
    const el = mount(
      h(ResultStep, {
        t,
        beforeUrl: 'b',
        resultUrl: 'r',
        resultCta: null,
        suggestedQuantity: 6,
        quantityRationale: 'About 6 panels.',
        quantity: 6,
        onSetQuantity,
        onSave: vi.fn(),
        onShare: vi.fn(),
        onRegenerate: vi.fn(),
        onFeedback: vi.fn(),
        onCta: vi.fn(),
      }),
    );
    expect(el.textContent).toContain('About 6 panels.');
    expect(el.querySelector('.lumina-step-val')?.textContent).toBe('6');

    const inc = el.querySelector('button[aria-label="Increase quantity"]') as HTMLButtonElement;
    inc.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetQuantity).toHaveBeenCalledWith(7);
  });

  it('omits the estimate block for single-unit products (no suggestedQuantity)', () => {
    const el = mount(
      h(ResultStep, {
        t,
        beforeUrl: 'b',
        resultUrl: 'r',
        resultCta: null,
        onSave: vi.fn(),
        onShare: vi.fn(),
        onRegenerate: vi.fn(),
        onFeedback: vi.fn(),
        onCta: vi.fn(),
      }),
    );
    expect(el.querySelector('.lumina-estimate')).toBeNull();
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

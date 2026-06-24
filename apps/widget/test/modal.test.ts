import { describe, it, expect, afterEach } from 'vitest';
import { render, type ComponentChild, h } from 'preact';
import { Modal } from '../src/ui/Modal.js';
import { YUZUVIEW_URL, YUZUVIEW_PRIVACY_URL } from '../src/core/config.js';
import { createTranslator } from '../src/core/i18n.js';

const t = createTranslator('en');

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

const baseProps = {
  onClose: () => {},
  poweredByLabel: t('poweredBy'),
  poweredByHref: YUZUVIEW_URL,
  legalNotice: t('legal.notice'),
  privacyLabel: t('legal.privacy'),
  privacyHref: YUZUVIEW_PRIVACY_URL,
  closeLabel: t('close'),
  children: h('div', null, 'body'),
};

describe('Modal footer', () => {
  it('YuzuView landing constant points at the public landing page', () => {
    expect(YUZUVIEW_URL).toBe('https://yuzu-view.base44.app/');
  });

  it('renders "Powered by" as a link to the YuzuView landing (new tab, no referrer leak)', () => {
    const el = mount(h(Modal, { ...baseProps, watermark: true }));
    const link = el.querySelector('a.lumina-powered') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(YUZUVIEW_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toBe(t('poweredBy'));
  });

  it('always shows the legal/privacy notice with a link to the privacy page (even without watermark)', () => {
    const el = mount(h(Modal, { ...baseProps, watermark: false }));
    expect(el.querySelector('a.lumina-powered')).toBeNull();
    const privacy = el.querySelector('a.lumina-legal-link') as HTMLAnchorElement;
    expect(privacy).toBeTruthy();
    expect(privacy.getAttribute('href')).toBe(YUZUVIEW_PRIVACY_URL);
    expect(privacy.getAttribute('rel')).toContain('noopener');
    expect(el.textContent).toContain(t('legal.notice'));
  });
});

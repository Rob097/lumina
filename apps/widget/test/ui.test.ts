import { describe, it, expect, afterEach } from 'vitest';
import { themeVars } from '../src/ui/theme.js';
import { sliderPosition } from '../src/ui/BeforeAfter.js';
import { createShadowMount, trapFocus } from '../src/ui/mount.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('themeVars', () => {
  it('always emits accent, radius and z-index tokens', () => {
    const vars = themeVars({ accent: '#0F62FE', radius: 12, zIndex: 2147483000 });
    expect(vars['--lumina-accent']).toBe('#0F62FE');
    expect(vars['--lumina-radius']).toBe('12px');
    expect(vars['--lumina-z']).toBe('2147483000');
  });

  it('resolves background/foreground for dark mode', () => {
    const light = themeVars({ mode: 'light', zIndex: 1 });
    const dark = themeVars({ mode: 'dark', zIndex: 1 });
    expect(dark['--lumina-bg']).not.toBe(light['--lumina-bg']);
    expect(dark['--lumina-fg']).toBeTruthy();
  });
});

describe('sliderPosition', () => {
  const rect = { left: 100, width: 200 };
  it('maps clientX to a 0–100 percentage', () => {
    expect(sliderPosition(200, rect)).toBe(50);
  });
  it('clamps beyond the edges', () => {
    expect(sliderPosition(0, rect)).toBe(0);
    expect(sliderPosition(9999, rect)).toBe(100);
  });
});

describe('createShadowMount', () => {
  it('attaches an open shadow root with styles + theme tokens', () => {
    const mount = createShadowMount(document, {
      theme: themeVars({ accent: '#abcdef', zIndex: 5 }),
      styles: '.lumina-x{color:red}',
    });
    expect(mount.host.shadowRoot).toBeTruthy();
    expect(mount.root.querySelector('style')?.textContent).toContain('.lumina-x');
    const container = mount.root.querySelector('[data-lumina-container]') as HTMLElement;
    expect(container.style.getPropertyValue('--lumina-accent')).toBe('#abcdef');
    mount.unmount();
    expect(document.body.contains(mount.host)).toBe(false);
  });
});

describe('trapFocus', () => {
  it('cycles focus on Tab and calls onEscape on Escape', () => {
    const container = document.createElement('div');
    const first = document.createElement('button');
    const last = document.createElement('button');
    container.append(first, last);
    document.body.appendChild(container);

    let escaped = false;
    const dispose = trapFocus(container, { onEscape: () => (escaped = true) });

    last.focus();
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(escaped).toBe(true);

    dispose();
  });
});

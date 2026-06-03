import { describe, it, expect } from 'vitest';
import { WIDGET_VERSION } from '../src/index.js';

describe('@lumina/widget scaffold', () => {
  it('exposes a semver-like bundle version', () => {
    expect(WIDGET_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('runs under a DOM environment (happy-dom)', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
  });
});

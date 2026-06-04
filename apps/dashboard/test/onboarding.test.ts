import { describe, expect, it } from 'vitest';
import { deriveOnboarding, type OnboardingState } from '../src/lib/onboarding';

const EMPTY: OnboardingState = {
  widgetConfigured: false,
  hasProducts: false,
  installed: false,
  hasGeneration: false,
};

describe('deriveOnboarding', () => {
  it('always counts the account step as done for an authenticated merchant', () => {
    const o = deriveOnboarding(EMPTY);
    expect(o.total).toBe(5);
    expect(o.completed).toBe(1); // account
    expect(o.steps[0]?.done).toBe(true);
    expect(o.allDone).toBe(false);
  });

  it('points the active step at the first incomplete task', () => {
    const o = deriveOnboarding(EMPTY);
    expect(o.activeIndex).toBe(1); // configure the widget
    expect(o.steps[o.activeIndex]?.key).toBe('configure');
  });

  it('marks individual steps done from real merchant signals', () => {
    const o = deriveOnboarding({ ...EMPTY, hasProducts: true });
    const products = o.steps.find((s) => s.key === 'products');
    expect(products?.done).toBe(true);
    expect(o.completed).toBe(2);
  });

  it('completes when every signal is satisfied', () => {
    const o = deriveOnboarding({
      widgetConfigured: true,
      hasProducts: true,
      installed: true,
      hasGeneration: true,
    });
    expect(o.completed).toBe(5);
    expect(o.allDone).toBe(true);
    expect(o.progressPct).toBe(100);
    expect(o.activeIndex).toBe(4); // clamped to the last step
  });

  it('reports progress as a rounded percentage of total', () => {
    const o = deriveOnboarding({ ...EMPTY, widgetConfigured: true });
    expect(o.completed).toBe(2);
    expect(o.progressPct).toBe(40); // 2 / 5
  });
});

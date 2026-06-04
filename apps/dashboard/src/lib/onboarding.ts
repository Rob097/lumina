/**
 * Onboarding checklist model. Step completion is derived from **real** merchant signals (config saved,
 * products added, widget installed/seen, a generation produced) — never fabricated — so the wizard
 * reflects what the merchant has actually done.
 */
export interface OnboardingState {
  widgetConfigured: boolean;
  hasProducts: boolean;
  installed: boolean;
  hasGeneration: boolean;
}

export interface OnboardingStep {
  key: 'account' | 'configure' | 'products' | 'install' | 'golive';
  title: string;
  body: string;
  href: string;
  cta: string;
  done: boolean;
}

export interface Onboarding {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  progressPct: number;
  activeIndex: number;
  allDone: boolean;
}

export function deriveOnboarding(state: OnboardingState): Onboarding {
  const steps: OnboardingStep[] = [
    {
      key: 'account',
      title: 'Create your account',
      body: 'Your workspace is ready. Invite teammates any time from Settings.',
      href: '/settings',
      cta: 'Manage team',
      done: true,
    },
    {
      key: 'configure',
      title: 'Style your widget',
      body: 'Match the launcher and result CTA to your brand with a live preview.',
      href: '/widget',
      cta: 'Open Widget settings',
      done: state.widgetConfigured,
    },
    {
      key: 'products',
      title: 'Add your products',
      body: 'Import a catalog or add a product so shoppers have something to try.',
      href: '/products',
      cta: 'Add products',
      done: state.hasProducts,
    },
    {
      key: 'install',
      title: 'Install the snippet',
      body: 'Paste one script line and a trigger button onto your product pages.',
      href: '/script',
      cta: 'Get the snippet',
      done: state.installed,
    },
    {
      key: 'golive',
      title: 'Run your first try-on',
      body: 'Generate a room composite end-to-end, then flip the widget to Live.',
      href: '/generations',
      cta: 'View generations',
      done: state.hasGeneration,
    },
  ];

  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === total;
  const firstIncomplete = steps.findIndex((s) => !s.done);
  const activeIndex = firstIncomplete === -1 ? total - 1 : firstIncomplete;
  const progressPct = Math.round((completed / total) * 100);

  return { steps, completed, total, progressPct, activeIndex, allDone };
}

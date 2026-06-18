import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { Onboarding, OnboardingStep } from '@/lib/onboarding';

const STEP_ICON: Record<OnboardingStep['key'], string> = {
  account: 'settings',
  configure: 'widget',
  products: 'products',
  install: 'script',
  golive: 'generations',
};

/** Guided setup checklist. Step state is derived from real merchant signals (see deriveOnboarding). */
export function OnboardingWizard({ onboarding }: { onboarding: Onboarding }) {
  const { steps, completed, total, progressPct, activeIndex, allDone } = onboarding;
  const active = steps[activeIndex];

  return (
    <div className="onboard">
      <header className="onboard-head">
        <div>
          <h2 className="onboard-title">{allDone ? "You're all set" : 'Get YuzuView live'}</h2>
          <p className="t-secondary onboard-sub">
            {allDone
              ? 'Setup is complete — your storefront is ready for shoppers.'
              : 'A few quick steps to put “Try in your room” on your storefront.'}
          </p>
        </div>
        <div className="onboard-progress">
          <span className="onboard-count">
            {completed} <span className="t-muted">/ {total}</span>
          </span>
          <div className="meter" style={{ width: 140 }}>
            <div className="meter-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </header>

      {!allDone && active && (
        <Link href={active.href} className="onboard-focus card">
          <div className="onboard-focus-ic">
            <Icon name={STEP_ICON[active.key]} size={22} strokeWidth={1.7} />
          </div>
          <div className="grow">
            <span className="badge badge-accent">Up next</span>
            <h3 className="onboard-focus-title">{active.title}</h3>
            <p className="t-secondary">{active.body}</p>
          </div>
          <span className="btn btn-primary">
            {active.cta}
            <Icon name="arrow-up-right" size={16} strokeWidth={2} />
          </span>
        </Link>
      )}

      {allDone && (
        <div className="onboard-done card">
          <div className="onboard-done-ic">
            <Icon name="dot" size={26} strokeWidth={2} />
          </div>
          <div className="grow">
            <h3 className="onboard-focus-title">Every step is done</h3>
            <p className="t-secondary">
              Track try-ons and conversions as shoppers use the widget.
            </p>
          </div>
          <Link href="/overview" className="btn btn-primary">
            Go to Overview
          </Link>
        </div>
      )}

      <ol className="onboard-list">
        {steps.map((step, i) => {
          const status = step.done ? 'done' : i === activeIndex ? 'active' : 'todo';
          return (
            <li key={step.key} className={`onboard-step is-${status}`}>
              <span className="onboard-step-mark">
                {step.done ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                    <path d="M5 12l5 5L20 6" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="grow">
                <span className="onboard-step-title">{step.title}</span>
                <span className="onboard-step-body t-muted">{step.body}</span>
              </span>
              {!step.done && (
                <Link href={step.href} className="btn btn-ghost btn-sm">
                  {step.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

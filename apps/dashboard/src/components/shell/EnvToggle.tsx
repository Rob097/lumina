'use client';

import { useEffect, useState } from 'react';
import { useEnv } from '@/lib/providers';

/**
 * Test/Live environment toggle (topbar). YuzuView runs a single live environment across all services
 * today, so Live is locked on and Test opens an explainer dialog instead of switching. Any stale
 * `test` cookie is migrated back to `live`.
 */
export function EnvToggle() {
  const { env, setEnv } = useEnv();
  const [showTest, setShowTest] = useState(false);

  useEffect(() => {
    if (env === 'test') setEnv('live');
  }, [env, setEnv]);

  return (
    <>
      <div className="env-toggle">
        <button className="on" data-env="live" type="button" onClick={() => setEnv('live')}>
          <span className="dot" />
          Live
        </button>
        <button
          className="is-locked"
          data-env="test"
          type="button"
          aria-disabled="true"
          onClick={() => setShowTest(true)}
        >
          <span className="dot" />
          Test
        </button>
      </div>

      {showTest ? (
        <div className="drawer-scrim" onClick={() => setShowTest(false)}>
          <div
            className="modal env-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <h3>Test environment</h3>
              <button
                className="icon-btn"
                type="button"
                aria-label="Close"
                onClick={() => setShowTest(false)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <p className="t-secondary">
                A separate test environment isn&apos;t available yet. YuzuView currently runs a single
                <strong> live</strong> environment across every service — your keys, products, and
                generations are all live.
              </p>
              <p className="t-muted text-sm">
                When test mode ships you&apos;ll get sandbox keys and an isolated dataset to trial the
                widget without spending live credits.
              </p>
            </div>
            <div className="drawer-foot">
              <button className="btn btn-primary" type="button" onClick={() => setShowTest(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

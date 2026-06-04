'use client';

import { useState, type CSSProperties } from 'react';
import type { WidgetSettings } from '@lumina/shared';
import { isDarkPreview, previewVars } from '@/lib/widget';

type PreviewState = 'button' | 'modal' | 'result';

const STATES: { key: PreviewState; label: string }[] = [
  { key: 'button', label: 'Button' },
  { key: 'modal', label: 'Modal' },
  { key: 'result', label: 'Result' },
];

/** Self-contained mock of the shopper widget; re-renders live from the Widget Settings form. */
export function WidgetPreview({ settings, env }: { settings: WidgetSettings; env: 'live' | 'test' }) {
  const [state, setState] = useState<PreviewState>('button');
  const wpStyle = previewVars(settings) as CSSProperties;
  const dark = isDarkPreview(settings.theme.mode);
  const accentWeak = previewVars(settings)['--wp-accent-weak'];

  return (
    <div className="preview-rail">
      <div className="preview-card">
        <div className="preview-head">
          <div className="ttl">
            <span className="pulse" />
            Live preview
          </div>
          <div className="segmented" style={{ padding: '2px' }}>
            {STATES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-selected={state === s.key}
                onClick={() => setState(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`preview-stage${dark ? ' is-dark' : ''}`}
          style={{ '--wp-accent-weak': accentWeak } as CSSProperties}
        >
          <div className="wp" style={wpStyle}>
            {state === 'button' && (
              <div className="wp-pdp">
                <div className="img">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <h4>Aura Floor Lamp</h4>
                <div className="price">€ 389,00</div>
                <button className="wp-trigger" type="button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21V9l9-6 9 6v12" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                  <span>{settings.buttonText || 'Try in your room'}</span>
                </button>
              </div>
            )}

            {state === 'modal' && (
              <div className="wp-modal">
                <div className="mh">
                  <span className="mt">Try Aura Floor Lamp in your room</span>
                  <span className="x">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </span>
                </div>
                <div className="mb">
                  <div className="wp-drop">
                    <div className="dz-ic">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 16V4M7 9l5-5 5 5" />
                        <path d="M5 20h14" />
                      </svg>
                    </div>
                    <div className="dz-t">{settings.i18n['upload.title'] || 'Add a photo of your room'}</div>
                    <div className="dz-s">Drag &amp; drop, or choose a source</div>
                  </div>
                  <div className="wp-actions">
                    <button className="wp-btn-2" type="button">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="2" y="6" width="20" height="14" rx="2" />
                        <circle cx="12" cy="13" r="3.5" />
                      </svg>
                      Camera
                    </button>
                    <button className="wp-btn-2 primary" type="button">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                      </svg>
                      Upload
                    </button>
                  </div>
                </div>
              </div>
            )}

            {state === 'result' && (
              <div className="wp-result">
                <div className="wp-ba">
                  <div className="after">
                    <span className="lbl">AFTER</span>
                  </div>
                  <div className="before">
                    <span className="lbl">BEFORE</span>
                  </div>
                  <div className="hdl">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
                    </svg>
                  </div>
                </div>
                <div className="rb">
                  <button className="wp-cta" type="button">
                    {settings.resultCta?.label || 'Add to cart'}
                  </button>
                  <div className="wp-result-tools">
                    <span className="wp-tool">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M12 15V3M7 10l5 5 5-5M5 21h14" />
                      </svg>
                      Save
                    </span>
                    <span className="wp-tool">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                      </svg>
                      Share
                    </span>
                    <span className="wp-tool">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                      Retry
                    </span>
                  </div>
                </div>
                {settings.watermark && (
                  <div className="wp-foot">
                    Powered by <b>LUMINA</b>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="preview-head"
          style={{ borderTop: '1px solid var(--hairline)', borderBottom: 'none' }}
        >
          <span className="caption t-muted">Changes apply live · not yet saved</span>
          <span className={`badge ${env === 'live' ? 'badge-live' : 'badge-test'}`}>
            <span className="dot" />
            {env === 'live' ? 'Live env' : 'Test env'}
          </span>
        </div>
      </div>
    </div>
  );
}

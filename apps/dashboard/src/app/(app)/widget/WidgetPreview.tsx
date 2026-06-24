'use client';

import { useState } from 'react';
import type { WidgetSettings } from '@lumina/shared';
import type { PreviewView } from '@lumina/widget/preview';
import { RealWidgetPreview } from './RealWidgetPreview';

const STATES: { key: PreviewView; label: string }[] = [
  { key: 'button', label: 'Button' },
  { key: 'guide', label: 'Guide' },
  { key: 'modal', label: 'Modal' },
  { key: 'result', label: 'Result' },
];

/**
 * Live preview of the shopper widget. Renders the **real** widget UI (via `@lumina/widget/preview`)
 * themed from the unsaved Widget Settings form, so what the merchant sees is exactly what ships.
 */
export function WidgetPreview({ settings, env }: { settings: WidgetSettings; env: 'live' | 'test' }) {
  const [view, setView] = useState<PreviewView>('button');

  // The Guide tab only appears once a guide is configured — keeps the preview honest about what ships.
  const hasGuide = Boolean(settings.guide?.enabled && settings.guide?.imageUrl);
  const states = hasGuide ? STATES : STATES.filter((s) => s.key !== 'guide');
  const activeView: PreviewView = view === 'guide' && !hasGuide ? 'button' : view;

  return (
    <div className="preview-rail">
      <div className="preview-card">
        <div className="preview-head">
          <div className="ttl">
            <span className="pulse" />
            Live preview
          </div>
          <div className="segmented" style={{ padding: '2px' }}>
            {states.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-selected={activeView === s.key}
                onClick={() => setView(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="preview-stage">
          <RealWidgetPreview settings={settings} view={activeView} onViewChange={setView} />
        </div>

        <div
          className="preview-head"
          style={{ borderTop: '1px solid var(--hairline)', borderBottom: 'none' }}
        >
          <span className="caption t-muted">The actual widget · changes apply live, not yet saved</span>
          <span className={`badge ${env === 'live' ? 'badge-live' : 'badge-test'}`}>
            <span className="dot" />
            {env === 'live' ? 'Live env' : 'Test env'}
          </span>
        </div>
      </div>
    </div>
  );
}

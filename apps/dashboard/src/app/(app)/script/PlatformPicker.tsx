'use client';

import { INSTALL_PLATFORMS } from '@/lib/platforms';
import { BrandIcon } from '@/components/ui/BrandIcon';

/**
 * Landing view for Script & install: pick where you're installing. Only the generic script is live
 * today (it works on any site); the per-platform plugins are stubbed "Coming soon". Selecting the
 * script card opens the existing two-snippet guide.
 */
export function PlatformPicker({ onSelectScript }: { onSelectScript: () => void }) {
  return (
    <div className="install-guide">
      <div className="install-head">
        <p className="t-secondary">
          Choose where you&apos;re installing YuzuView. The generic script works on any website today —
          native plugins for the major platforms are on the way.
        </p>
      </div>

      <div className="platform-grid">
        {INSTALL_PLATFORMS.map((p) => {
          const available = p.status === 'available';
          const inner = (
            <>
              <BrandIcon name={p.brandIcon} size={34} />
              <div className="platform-meta">
                <h3>
                  {p.name}
                  {!available && <span className="badge badge-neutral platform-soon">Coming soon</span>}
                </h3>
                <p>{p.blurb}</p>
              </div>
            </>
          );

          return available ? (
            <button
              key={p.id}
              type="button"
              className="card platform-card is-clickable"
              onClick={onSelectScript}
            >
              {inner}
              <span className="platform-go" aria-hidden="true">
                →
              </span>
            </button>
          ) : (
            <div key={p.id} className="card platform-card is-soon" aria-disabled="true">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

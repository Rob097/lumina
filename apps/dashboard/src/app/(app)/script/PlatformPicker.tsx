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
      <div className="install-hero">
        <h2>Where are you installing YuzuView?</h2>
        <p>Pick your platform. The generic script works anywhere; one-click installers are on the way.</p>
      </div>

      <div className="platform-grid">
        {INSTALL_PLATFORMS.map((p) => {
          const available = p.status === 'available';
          const inner = (
            <>
              <div className="platform-card-top">
                <BrandIcon name={p.brandIcon} size={42} />
                <span className={`badge ${available ? 'badge-success' : 'badge-neutral'}`}>
                  {available ? 'Available' : 'Coming soon'}
                </span>
              </div>
              <h3>{p.name}</h3>
              <p>{p.blurb}</p>
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

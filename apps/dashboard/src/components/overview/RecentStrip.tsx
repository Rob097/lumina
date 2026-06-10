import Link from 'next/link';
import type { GenerationSummary } from '@lumina/shared';
import { shortDate } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Recent generations strip — the newest runs, linking through to the gallery. Thumbnails are the
 * signed result URLs (D50); a status-tinted fallback shows while a run has no result yet.
 */
export function RecentStrip({ items }: { items: GenerationSummary[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Recent generations</h3>
        <Link className="btn btn-ghost btn-sm" href="/generations">
          Open gallery
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="card-pad">
          <EmptyState
            icon="generations"
            title="No generations yet"
            body="When a shopper tries a product in their room, the latest results appear here."
          />
        </div>
      ) : (
        <div className="card-pad recent-strip">
          {items.map((g) => (
            <Link key={g.id} href="/generations" className="recent-item" title={g.productName}>
              <span className="recent-thumb">
                {g.resultUrl ? (
                  <img src={g.resultUrl} alt="" loading="lazy" />
                ) : (
                  <span className={`recent-thumb-fallback status-${g.status}`} />
                )}
              </span>
              <span className="recent-name">{g.productName}</span>
              <span className="recent-sub">{shortDate(new Date(g.createdAt))}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

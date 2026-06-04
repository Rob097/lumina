import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Recent generations strip. Phase A renders the empty state; it's wired to `GET /v1/generations` in
 * Phase C (the generations gallery).
 */
export function RecentStrip() {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Recent generations</h3>
        <Link className="btn btn-ghost btn-sm" href="/generations">
          Open gallery
        </Link>
      </div>
      <div className="card-pad">
        <EmptyState
          icon="generations"
          title="No generations yet"
          body="When a shopper tries a product in their room, the latest results appear here."
        />
      </div>
    </div>
  );
}

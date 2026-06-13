'use client';

import { useState, useTransition } from 'react';
import type { GenerationSummary, GenerationsListResponse } from '@lumina/shared';
import { statusBadge } from '@/lib/generation-format';
import { shortDate } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { GenerationDetailModal } from '../generations/GenerationDetailModal';

/**
 * A grid of render cards that opens the before/after detail modal — shared by the Studio overview
 * (recent renders) and the client detail page (a client's history, with optional "Load more").
 */
export function StudioRenderGrid({
  initial,
  initialCursor = null,
  loadMore,
  empty,
}: {
  initial: GenerationSummary[];
  initialCursor?: string | null;
  loadMore?: (cursor: string) => Promise<GenerationsListResponse>;
  empty: { title: string; body: string };
}) {
  const [items, setItems] = useState<GenerationSummary[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [active, setActive] = useState<GenerationSummary | null>(null);
  const [pending, startTransition] = useTransition();

  function more(): void {
    if (!cursor || !loadMore) return;
    startTransition(async () => {
      const res = await loadMore(cursor);
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    });
  }

  if (items.length === 0) {
    return <EmptyState icon="generations" title={empty.title} body={empty.body} />;
  }

  return (
    <div className="gens">
      <div className="gens-grid">
        {items.map((g) => {
          const badge = statusBadge(g.status);
          return (
            <button key={g.id} type="button" className="gen-card" onClick={() => setActive(g)}>
              <div className="gen-thumb">
                {g.resultUrl ? (
                  <img src={g.resultUrl} alt="" loading="lazy" />
                ) : (
                  <span className={`gen-thumb-fallback status-${g.status}`} />
                )}
                <span className={`badge ${badge.cls} gen-card-badge`}>{badge.label}</span>
              </div>
              <div className="gen-card-meta">
                <span className="gen-card-name">{g.productName}</span>
                <span className="gen-card-sub">{shortDate(new Date(g.createdAt))}</span>
              </div>
            </button>
          );
        })}
      </div>

      {cursor && loadMore ? (
        <div className="gens-more">
          <button className="btn btn-secondary" type="button" onClick={more} disabled={pending}>
            {pending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}

      {active && <GenerationDetailModal summary={active} onClose={() => setActive(null)} />}
    </div>
  );
}

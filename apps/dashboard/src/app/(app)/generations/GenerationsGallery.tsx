'use client';

import { useState, useTransition } from 'react';
import { GENERATION_STATUSES, type GenerationStatus, type GenerationSummary } from '@lumina/shared';
import { statusBadge } from '@/lib/generation-format';
import { shortDate } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { GenerationDetailModal } from './GenerationDetailModal';
import { loadGenerationsAction } from './actions';

type Filter = 'all' | GenerationStatus;
const FILTERS: Filter[] = ['all', ...GENERATION_STATUSES];

export function GenerationsGallery({
  initial,
  initialCursor,
}: {
  initial: GenerationSummary[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState<GenerationSummary[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [filter, setFilter] = useState<Filter>('all');
  const [active, setActive] = useState<GenerationSummary | null>(null);
  const [pending, startTransition] = useTransition();

  function applyFilter(next: Filter) {
    setFilter(next);
    startTransition(async () => {
      const res = await loadGenerationsAction({ status: next === 'all' ? undefined : next });
      setItems(res.items);
      setCursor(res.nextCursor);
    });
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const res = await loadGenerationsAction({
        status: filter === 'all' ? undefined : filter,
        cursor,
      });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    });
  }

  return (
    <div className="gens">
      <div className="gens-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip ${filter === f ? 'is-on' : ''}`}
            onClick={() => applyFilter(f)}
          >
            {f === 'all' ? 'All' : statusBadge(f).label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="generations"
          title="No generations yet"
          body="Once shoppers try products in their room, every run shows up here with a before/after."
        />
      ) : (
        <>
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

          {cursor && (
            <div className="gens-more">
              <button className="btn btn-secondary" type="button" onClick={loadMore} disabled={pending}>
                {pending ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {active && <GenerationDetailModal summary={active} onClose={() => setActive(null)} />}
    </div>
  );
}

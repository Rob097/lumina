'use client';

import { useEffect, useState } from 'react';
import type { GenerationDetail, GenerationSummary } from '@lumina/shared';
import { categoryLabel } from '@/lib/product-format';
import { latencyLabel, statusBadge } from '@/lib/generation-format';
import { BeforeAfter } from './BeforeAfter';
import { getGenerationDetailAction } from './actions';

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="gen-meta-item">
      <span className="gen-meta-k">{label}</span>
      <span className="gen-meta-v">{value}</span>
    </div>
  );
}

export function GenerationDetailModal({
  summary,
  onClose,
}: {
  summary: GenerationSummary;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<GenerationDetail | null>(null);
  const badge = statusBadge(summary.status);

  useEffect(() => {
    let alive = true;
    getGenerationDetailAction(summary.id).then((d) => {
      if (alive) setDetail(d);
    });
    return () => {
      alive = false;
    };
  }, [summary.id]);

  const before = detail?.roomUrl ?? summary.roomUrl;
  const after = detail?.resultUrl ?? summary.resultUrl;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <div className="gen-modal-title">
            <h3>{summary.productName}</h3>
            <span className={`badge ${badge.cls}`}>{badge.label}</span>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="gen-modal-body">
          <BeforeAfter beforeUrl={before} afterUrl={after} />

          <div className="gen-meta">
            <Meta label="Category" value={categoryLabel(summary.productCategory)} />
            <Meta label="Model" value={summary.model ?? '—'} />
            <Meta label="Latency" value={latencyLabel(summary.latencyMs) ?? '—'} />
            <Meta label="Credits" value={String(summary.creditsSpent)} />
            <Meta label="Cost" value={detail?.costCents != null ? `${detail.costCents}¢` : null} />
            <Meta label="Placement" value={detail?.placementHint ?? null} />
            <Meta label="Created" value={new Date(summary.createdAt).toLocaleString()} />
            {summary.errorCode && <Meta label="Error" value={summary.errorCode} />}
            {summary.pageUrl && <Meta label="Page" value={summary.pageUrl} />}
          </div>
        </div>
      </div>
    </div>
  );
}

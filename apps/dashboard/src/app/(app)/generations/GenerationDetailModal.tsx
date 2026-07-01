'use client';

import { useEffect, useState } from 'react';
import type { GenerationDetail, GenerationSummary } from '@lumina/shared';
import { categoryLabel } from '@/lib/product-format';
import { latencyLabel, statusBadge, totalTimeLabel } from '@/lib/generation-format';
import { BeforeAfter } from './BeforeAfter';
import { getGenerationDetailAction } from './actions';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="gen-meta-row">
      <span className="gen-meta-k">{label}</span>
      <span className="gen-meta-v">{value ?? '—'}</span>
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
  // After retention purges the full-res originals, fall back to the long-lived thumbnail so the gallery
  // still shows the result; the room original has no thumbnail and simply disappears.
  const after =
    detail?.resultUrl ?? summary.resultUrl ?? detail?.thumbUrl ?? summary.thumbUrl;
  const originalsPurged = detail?.originalsPurged ?? summary.originalsPurged;
  // Prefer the real micro-USD cost (precise for sub-cent calls) over the rounded cents view.
  const realUsd =
    detail?.costMicros != null
      ? detail.costMicros / 1_000_000
      : detail?.costCents != null
        ? detail.costCents / 100
        : null;
  const cost =
    realUsd != null
      ? `${summary.creditsSpent} · $${realUsd.toFixed(realUsd < 0.1 ? 4 : 2)}`
      : String(summary.creditsSpent);
  const suggestedQty = detail?.suggestedQuantity ?? null;
  const suggested =
    suggestedQty != null ? `${suggestedQty} unit${suggestedQty === 1 ? '' : 's'}` : null;

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="modal gen-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="gen-modal-media">
          <BeforeAfter beforeUrl={before} afterUrl={after} />
        </div>

        <div className="gen-modal-panel">
          <div className="gen-modal-phead">
            <h3>{summary.productName}</h3>
            <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <span className={`badge ${badge.cls}`} style={{ width: 'max-content' }}>
            {badge.label}
          </span>

          <div className="gen-meta-list">
            <Row label="Category" value={categoryLabel(summary.productCategory)} />
            <Row label="Model" value={summary.model} />
            <Row label="Latency (compose)" value={latencyLabel(summary.latencyMs)} />
            <Row label="Total time" value={totalTimeLabel(summary.createdAt, summary.finishedAt)} />
            <Row label="Credits · cost" value={cost} />
            <Row label="Placement" value={detail?.placementHint} />
            {suggested ? <Row label="Suggested quantity" value={suggested} /> : null}
            <Row label="Created" value={new Date(summary.createdAt).toLocaleString()} />
            {summary.errorCode ? <Row label="Error" value={summary.errorCode} /> : null}
          </div>

          {detail?.quantityRationale ? (
            <p className="gen-note">{detail.quantityRationale}</p>
          ) : null}

          {originalsPurged ? (
            <p className="gen-note">
              Full-resolution originals were removed per our data-retention policy. A preview is kept.
            </p>
          ) : null}

          {summary.pageUrl ? (
            <div className="gen-pageurl">
              <span className="gen-meta-k">Page URL</span>
              <span className="gen-pageurl-v">{summary.pageUrl}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

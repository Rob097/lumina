'use client';

import { useState } from 'react';
import { lostFeatures, shopLimit, type PlanTier } from '@lumina/shared';

export interface DowngradeWorkspace {
  id: string;
  name: string;
}

/**
 * Confirm a downgrade: warns about the benefits lost (set-difference of the plans' feature lists) and,
 * when the target plan allows fewer active workspaces than the account currently has, makes the owner
 * choose exactly which to KEEP active — the rest are deactivated (reversible).
 */
export function DowngradeModal({
  currentPlan,
  targetPlan,
  targetLabel,
  workspaces,
  activeMerchantId,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  currentPlan: PlanTier;
  targetPlan: PlanTier;
  targetLabel: string;
  /** The account's ACTIVE workspaces. */
  workspaces: DowngradeWorkspace[];
  activeMerchantId?: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (keepMerchantIds: string[]) => void;
}) {
  const limit = shopLimit(targetPlan);
  const reduces = workspaces.length > limit;
  const lost = lostFeatures(currentPlan, targetPlan);
  const [keep, setKeep] = useState<string[]>(() => {
    if (!reduces) return workspaces.map((w) => w.id);
    // Default to keeping the workspace the owner is currently in, then fill the rest in order.
    const ordered = activeMerchantId
      ? [...workspaces].sort((a, b) =>
          a.id === activeMerchantId ? -1 : b.id === activeMerchantId ? 1 : 0,
        )
      : workspaces;
    return ordered.slice(0, limit).map((w) => w.id);
  });

  function toggle(id: string): void {
    setKeep((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < limit
          ? [...cur, id]
          : cur,
    );
  }

  const canConfirm = !reduces || keep.length === limit;

  return (
    <div className="drawer-scrim" onClick={pending ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <h3>Downgrade to {targetLabel}?</h3>
        </header>
        <div className="drawer-body">
          {lost.length > 0 && (
            <div>
              <p className="t-secondary settings-p">You&apos;ll lose or reduce:</p>
              <ul className="downgrade-lost">
                {lost.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {reduces ? (
            <div className="field">
              <span className="field-label">
                {targetLabel} includes {limit} active workspace{limit === 1 ? '' : 's'} — choose which to
                keep. The rest are deactivated (reversible — their data is kept).
              </span>
              <ul className="downgrade-ws">
                {workspaces.map((w) => {
                  const kept = keep.includes(w.id);
                  return (
                    <li key={w.id} className={`downgrade-ws-row${kept ? ' is-keep' : ' is-drop'}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={kept}
                          disabled={pending || (!kept && keep.length >= limit)}
                          onChange={() => toggle(w.id)}
                        />
                        <span className="grow">
                          {w.name}
                          {w.id === activeMerchantId ? ' (current)' : ''}
                        </span>
                        <span className="downgrade-tag">{kept ? 'Keep active' : 'Deactivate'}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="t-muted text-sm">
                Deactivated workspaces stop generating + their widget goes off, but nothing is deleted —
                reactivate them after an upgrade.
              </p>
            </div>
          ) : null}

          {error && <p className="field-error">{error}</p>}
        </div>
        <footer className="drawer-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canConfirm || pending}
            onClick={() => onConfirm(reduces ? keep : [])}
          >
            {pending ? 'Applying…' : 'Confirm downgrade'}
          </button>
        </footer>
      </div>
    </div>
  );
}

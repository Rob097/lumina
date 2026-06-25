'use client';

import { lostFeatures, type PlanTier } from '@lumina/shared';
import { formatPrice } from '@/lib/billing';

/**
 * Confirm an upgrade in-app (no Stripe portal detour). Shows what the higher plan adds and is explicit
 * about billing timing: the plan changes immediately, but — symmetric with our downgrades — the new
 * price starts at the next renewal, so there's no surprise mid-cycle charge.
 */
export function UpgradeModal({
  currentPlan,
  targetPlan,
  targetLabel,
  priceMonthly,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  currentPlan: PlanTier;
  targetPlan: PlanTier;
  targetLabel: string;
  priceMonthly: number | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  // Features on the target plan but not the current one = what the upgrade unlocks (inverse set-difference).
  const gained = lostFeatures(targetPlan, currentPlan);

  return (
    <div className="drawer-scrim" onClick={pending ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <h3>Upgrade to {targetLabel}?</h3>
        </header>
        <div className="drawer-body">
          {gained.length > 0 && (
            <div>
              <p className="t-secondary settings-p">You&apos;ll unlock:</p>
              <ul className="downgrade-lost">
                {gained.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="t-muted text-sm">
            Your plan changes right away. The new price
            {priceMonthly != null ? ` (${formatPrice(priceMonthly)}/mo)` : ''} starts at your next
            renewal — no charge today.
          </p>
          {error && <p className="field-error">{error}</p>}
        </div>
        <footer className="drawer-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={onConfirm}>
            {pending ? 'Applying…' : 'Confirm upgrade'}
          </button>
        </footer>
      </div>
    </div>
  );
}

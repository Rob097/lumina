'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BillingPlansResponse, CreditsResponse, LedgerEntry, PlanTier } from '@lumina/shared';
import { formatPrice, planCta } from '@/lib/billing';
import { compact, groupThousands, shortDate } from '@/lib/format';
import { creditMeter } from '@/lib/shell';
import { changeAction, checkoutAction, portalAction } from './actions';
import { DowngradeModal, type DowngradeWorkspace } from './DowngradeModal';
import { UpgradeModal } from './UpgradeModal';

function LedgerAmount({ amount }: { amount: number }) {
  const up = amount >= 0;
  return (
    <span className={`ledger-amt ${up ? 'pos' : 'neg'}`}>
      {up ? '+' : ''}
      {groupThousands(amount)}
    </span>
  );
}

const REASON_LABEL: Record<LedgerEntry['reason'], string> = {
  purchase: 'Purchase',
  grant: 'Grant',
  generation: 'Generation',
  refund: 'Refund',
  adjustment: 'Adjustment',
  expiry: 'Expiry',
};

export function BillingView({
  plans,
  credits,
  status,
  shopCount,
  maxShops,
  hasActiveSubscription,
  workspaces,
  activeMerchantId,
  canManageBilling,
}: {
  plans: BillingPlansResponse;
  credits: CreditsResponse | null;
  status?: 'success' | 'cancelled';
  /** Active workspaces on this account, and the plan's shop allowance (`null` = unlimited). */
  shopCount: number;
  maxShops: number | null;
  /** Whether the account already has a live subscription — upgrades go to the portal, not Checkout. */
  hasActiveSubscription: boolean;
  workspaces: DowngradeWorkspace[];
  activeMerchantId?: string;
  /** Only the account owner may change the plan / open the portal — gate the CTAs accordingly. */
  canManageBilling: boolean;
}) {
  const router = useRouter();
  const [pendingPlan, setPendingPlan] = useState<PlanTier | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Plan-change modals (only for accounts that already subscribe): downgrade picks which shops to keep;
  // upgrade just confirms. Both go through the first-party /billing/change endpoint (no Stripe portal).
  const [downgrade, setDowngrade] = useState<{ tier: PlanTier; label: string } | null>(null);
  const [upgrade, setUpgrade] = useState<{ tier: PlanTier; label: string; price: number | null } | null>(
    null,
  );
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeNotice, setChangeNotice] = useState<string | null>(null);
  const [changePending, startChange] = useTransition();

  const meter = credits ? creditMeter(credits.balance, credits.included) : null;

  function go(action: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>, key: PlanTier | 'portal') {
    setError(null);
    setPendingPlan(key);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        window.location.href = res.url;
      } else {
        setError(res.error);
        setPendingPlan(null);
      }
    });
  }

  function confirmDowngrade(keepMerchantIds: string[]) {
    if (!downgrade) return;
    setChangeError(null);
    startChange(async () => {
      const label = downgrade.label;
      const res = await changeAction(downgrade.tier, keepMerchantIds);
      if (res.ok) {
        setDowngrade(null);
        // accounts.plan flips once the Stripe webhook lands, so the cards may lag a moment — tell the user.
        setChangeNotice(`Downgrade to ${label} is being applied — your plan and workspaces update shortly.`);
        router.refresh();
      } else {
        setChangeError(res.error);
      }
    });
  }

  function confirmUpgrade() {
    if (!upgrade) return;
    setChangeError(null);
    startChange(async () => {
      const label = upgrade.label;
      // Upgrades never reduce shops, so no keep-selection is sent.
      const res = await changeAction(upgrade.tier, []);
      if (res.ok) {
        setUpgrade(null);
        setChangeNotice(`Upgrade to ${label} is being applied — your plan updates shortly.`);
        router.refresh();
      } else {
        setChangeError(res.error);
      }
    });
  }

  return (
    <div className="billing">
      {status === 'success' && (
        <div className="notice notice-success">Subscription updated — your new credits are on the way.</div>
      )}
      {status === 'cancelled' && <div className="notice">Checkout cancelled. No changes were made.</div>}
      {changeNotice && <div className="notice notice-success">{changeNotice}</div>}
      {error && <div className="notice notice-danger">{error}</div>}
      {!canManageBilling && (
        <div className="notice">Only the account owner can change the plan or manage billing.</div>
      )}

      {/* Credit summary */}
      <div className="card credit-summary">
        <div className="card-pad credit-summary-grid">
          <div>
            <div className="cs-label">Credits remaining</div>
            <div className="cs-value tnum">{credits ? groupThousands(credits.balance) : '—'}</div>
            {credits && (
              <div className="cs-sub t-muted">
                {compact(credits.used)} of {compact(credits.included)} used this cycle
                {credits.resetsAt ? ` · resets ${shortDate(new Date(credits.resetsAt))}` : ''}
              </div>
            )}
            <div className="cs-sub t-muted">
              Shared across {shopCount === 1 ? 'your shop' : `${shopCount} shops`}
              {maxShops === null
                ? ' · unlimited shops'
                : ` · ${shopCount} of ${maxShops} shops used`}
            </div>
          </div>
          <div className="cs-meter">
            {meter && (
              <div className="meter">
                <div
                  className={`meter-fill ${meter.level === 'ok' ? '' : meter.level}`}
                  style={{ width: `${meter.usedPct}%` }}
                />
              </div>
            )}
            {canManageBilling && (
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                disabled={pendingPlan !== null}
                onClick={() => go(portalAction, 'portal')}
              >
                {pendingPlan === 'portal' ? 'Opening…' : 'Manage billing'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="plan-grid">
        {plans.plans.map((p) => {
          const cta = planCta(plans.currentPlan, p.tier);
          return (
            <div key={p.tier} className={`plan-card ${p.highlight ? 'is-highlight' : ''} ${cta === 'current' ? 'is-current' : ''}`}>
              {p.highlight && <span className="plan-ribbon">Most popular</span>}
              <div className="plan-name">{p.label}</div>
              <div className="plan-price">
                {formatPrice(p.priceMonthly)}
                {p.priceMonthly ? <span className="plan-per">/mo</span> : null}
              </div>
              <div className="plan-credits">{groupThousands(p.includedCredits)} credits / mo</div>
              <ul className="plan-features">
                {p.features.map((f) => (
                  <li key={f}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" width="13" height="13">
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              {cta === 'current' ? (
                <button className="btn btn-secondary" type="button" disabled>
                  Current plan
                </button>
              ) : cta === 'contact' ? (
                // Enterprise is sales-assisted: route to the in-app support form, pre-filled, rather than a
                // dead mailto. Topic → "Billing question", subject → the enterprise request.
                <Link
                  className="btn btn-secondary"
                  href={`/support?topic=billing&subject=${encodeURIComponent('Request of Enterprise plan')}`}
                >
                  Contact sales
                </Link>
              ) : !canManageBilling ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled
                  title="Only the account owner can change the plan"
                >
                  Owner only
                </button>
              ) : hasActiveSubscription ? (
                // The account already subscribes: both upgrades and downgrades are handled in-app via our
                // own modals (no confusing Stripe-portal detour). The portal stays behind "Manage billing"
                // for payment method + cancellation only.
                cta === 'upgrade' ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={changePending}
                    onClick={() => {
                      setChangeError(null);
                      setUpgrade({ tier: p.tier, label: p.label, price: p.priceMonthly });
                    }}
                  >
                    Upgrade
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={changePending}
                    onClick={() => {
                      setChangeError(null);
                      setDowngrade({ tier: p.tier, label: p.label });
                    }}
                  >
                    Downgrade
                  </button>
                )
              ) : (
                // No subscription yet → first purchase via Checkout.
                <button
                  className={`btn ${cta === 'upgrade' ? 'btn-primary' : 'btn-secondary'}`}
                  type="button"
                  disabled={pendingPlan !== null}
                  onClick={() => go(() => checkoutAction(p.tier), p.tier)}
                >
                  {pendingPlan === p.tier ? 'Redirecting…' : cta === 'upgrade' ? 'Upgrade' : 'Switch'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Ledger */}
      <div className="card">
        <div className="card-head">
          <h3>Credit ledger</h3>
        </div>
        {credits && credits.ledger.length > 0 ? (
          <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Reason</th>
                <th>Note</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {credits.ledger.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className="badge">{REASON_LABEL[e.reason]}</span>
                  </td>
                  <td className="t-muted text-sm">{e.note ?? '—'}</td>
                  <td className="t-muted text-sm">{shortDate(new Date(e.createdAt))}</td>
                  <td style={{ textAlign: 'right' }}>
                    <LedgerAmount amount={e.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="card-pad t-muted">No credit activity yet.</div>
        )}
      </div>

      {downgrade && (
        <DowngradeModal
          currentPlan={plans.currentPlan}
          targetPlan={downgrade.tier}
          targetLabel={downgrade.label}
          workspaces={workspaces}
          activeMerchantId={activeMerchantId}
          pending={changePending}
          error={changeError}
          onClose={() => setDowngrade(null)}
          onConfirm={confirmDowngrade}
        />
      )}

      {upgrade && (
        <UpgradeModal
          currentPlan={plans.currentPlan}
          targetPlan={upgrade.tier}
          targetLabel={upgrade.label}
          priceMonthly={upgrade.price}
          pending={changePending}
          error={changeError}
          onClose={() => setUpgrade(null)}
          onConfirm={confirmUpgrade}
        />
      )}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import type { BillingPlansResponse, CreditsResponse, LedgerEntry, PlanTier } from '@lumina/shared';
import { formatPrice, planCta } from '@/lib/billing';
import { compact, groupThousands, shortDate } from '@/lib/format';
import { creditMeter } from '@/lib/shell';
import { checkoutAction, portalAction } from './actions';

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
}: {
  plans: BillingPlansResponse;
  credits: CreditsResponse | null;
  status?: 'success' | 'cancelled';
  /** Workspaces on this account, and the plan's shop allowance (`null` = unlimited). */
  shopCount: number;
  maxShops: number | null;
}) {
  const [pendingPlan, setPendingPlan] = useState<PlanTier | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  return (
    <div className="billing">
      {status === 'success' && (
        <div className="notice notice-success">Subscription updated — your new credits are on the way.</div>
      )}
      {status === 'cancelled' && <div className="notice">Checkout cancelled. No changes were made.</div>}
      {error && <div className="notice notice-danger">{error}</div>}

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
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={pendingPlan !== null}
              onClick={() => go(portalAction, 'portal')}
            >
              {pendingPlan === 'portal' ? 'Opening…' : 'Manage billing'}
            </button>
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
                <a className="btn btn-secondary" href="mailto:sales@rdlabs.digital?subject=Enterprise%20plan">
                  Contact sales
                </a>
              ) : cta === 'downgrade' && p.tier === 'free' ? (
                // Downgrading to Free = cancelling the subscription; Free has no Stripe price, so this
                // must go through the billing portal (Stripe's cancel flow), never Checkout.
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={pendingPlan !== null}
                  onClick={() => go(portalAction, 'portal')}
                >
                  {pendingPlan === 'portal' ? 'Opening…' : 'Cancel plan'}
                </button>
              ) : (
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
    </div>
  );
}

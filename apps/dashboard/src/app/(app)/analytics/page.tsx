import './analytics.css';
import '../overview/overview.css';
import Link from 'next/link';
import { canUseAnalytics } from '@lumina/shared';
import {
  fetchAnalyticsSummary,
  fetchAnalyticsTimeseries,
  fetchCredits,
  fetchMe,
} from '@/lib/api';
import { resolveActiveMerchant } from '@/lib/workspace';
import { rangeLabel } from '@/lib/format';
import { KpiRow } from '@/components/overview/KpiRow';
import { FunnelCard } from '@/components/overview/FunnelCard';
import { TimeseriesChart } from '@/components/overview/TimeseriesChart';
import { TopProducts } from '@/components/overview/TopProducts';
import { EmptyState } from '@/components/ui/EmptyState';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  // Server-side gate: analytics is a Growth+ perk. The nav entry is already hidden below Growth, but guard
  // the page too so a direct URL shows an upsell instead of empty charts (the API also returns 403).
  const me = await fetchMe();
  const activeMerchant = await resolveActiveMerchant(me?.merchants ?? []);
  if (!activeMerchant || !canUseAnalytics(activeMerchant.plan)) {
    return (
      <EmptyState
        icon="analytics"
        title="Analytics is a Growth feature"
        body="Upgrade to the Growth plan or above to unlock impressions, conversion, and product insights."
        action={
          <Link className="btn btn-primary" href="/billing">
            See plans
          </Link>
        }
      />
    );
  }

  const { range } = await searchParams;
  const days = RANGES.some((r) => String(r.days) === range) ? Number(range) : 30;
  const interval = days >= 90 ? 'week' : 'day';

  const now = new Date();
  const curFrom = new Date(now.getTime() - days * DAY_MS);
  const prevFrom = new Date(now.getTime() - 2 * days * DAY_MS);

  const [summary, prev, series, credits] = await Promise.all([
    fetchAnalyticsSummary({ from: curFrom.toISOString(), to: now.toISOString() }),
    fetchAnalyticsSummary({ from: prevFrom.toISOString(), to: curFrom.toISOString() }),
    fetchAnalyticsTimeseries({ from: curFrom.toISOString(), to: now.toISOString(), interval }),
    fetchCredits(),
  ]);

  if (!summary) {
    return (
      <EmptyState
        icon="analytics"
        title="Analytics are warming up"
        body="We couldn't load your metrics just now. Refresh in a moment."
      />
    );
  }

  const points = series?.points ?? [];

  return (
    <div className="col">
      <div className="analytics-head">
        <span className="sub">{rangeLabel(curFrom, now)}</span>
        <div className="range-tabs">
          {RANGES.map((r) => (
            <Link
              key={r.days}
              href={`/analytics?range=${r.days}`}
              className={`range-tab ${r.days === days ? 'is-on' : ''}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <KpiRow
        summary={summary}
        prev={prev}
        credits={credits}
        genSeries={points.map((p) => p.generations)}
        ctaSeries={points.map((p) => p.ctaClicks)}
      />

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Generations &amp; CTA over time</h3>
            <div className="chart-legend">
              <span className="lg">
                <span className="sw" style={{ background: 'var(--accent)' }} />
                Generations
              </span>
              <span className="lg">
                <span className="sw" style={{ background: 'var(--viz-3)' }} />
                CTA clicks
              </span>
            </div>
          </div>
          <div className="card-pad chart-wrap">
            {points.length > 0 ? (
              <TimeseriesChart points={points} />
            ) : (
              <EmptyState
                icon="analytics"
                title="No activity in this period"
                body="Generations and CTA clicks will chart here as shoppers use the widget."
              />
            )}
          </div>
        </div>

        <FunnelCard summary={summary} />
      </div>

      <TopProducts products={summary.topProducts} />
    </div>
  );
}

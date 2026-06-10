import './overview.css';
import {
  fetchAnalyticsSummary,
  fetchAnalyticsTimeseries,
  fetchCredits,
  fetchDomains,
  fetchGenerations,
} from '@/lib/api';
import { rangeLabel } from '@/lib/format';
import { Banner } from '@/components/overview/Banner';
import { KpiRow } from '@/components/overview/KpiRow';
import { FunnelCard } from '@/components/overview/FunnelCard';
import { TimeseriesChart } from '@/components/overview/TimeseriesChart';
import { TopProducts } from '@/components/overview/TopProducts';
import { RecentStrip } from '@/components/overview/RecentStrip';
import { EmptyState } from '@/components/ui/EmptyState';

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export default async function OverviewPage() {
  const now = new Date();
  const curFrom = new Date(now.getTime() - PERIOD_MS);
  const prevFrom = new Date(now.getTime() - 2 * PERIOD_MS);

  const [summary, prev, series, credits, domains, recent] = await Promise.all([
    fetchAnalyticsSummary({ from: curFrom.toISOString(), to: now.toISOString() }),
    fetchAnalyticsSummary({ from: prevFrom.toISOString(), to: curFrom.toISOString() }),
    fetchAnalyticsTimeseries({ from: curFrom.toISOString(), to: now.toISOString() }),
    fetchCredits(),
    fetchDomains(),
    fetchGenerations({ limit: '8' }),
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
      <Banner domainCount={domains.length} rangeLabel={rangeLabel(curFrom, now)} />

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
            <h3>Generations over time</h3>
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
                body="Your generations and CTA clicks will chart here as shoppers use the widget."
              />
            )}
          </div>
        </div>

        <FunnelCard summary={summary} />
      </div>

      <div className="grid-2b">
        <TopProducts products={summary.topProducts} />
        <RecentStrip items={recent.items} />
      </div>
    </div>
  );
}

import type { AnalyticsSummary, CreditsResponse } from '@lumina/shared';
import { Icon } from '@/components/ui/Icon';
import { compact, delta, groupThousands, pct, shortDate, type Delta } from '@/lib/format';
import { sparkPath } from '@/lib/overview';
import { creditMeter } from '@/lib/shell';

function DeltaChip({ d, suffix = 'vs last period' }: { d: Delta; suffix?: string }) {
  if (d.dir === 'flat') {
    return (
      <span className="kpi-foot">
        <span className="t-muted">No change {suffix}</span>
      </span>
    );
  }
  const up = d.dir === 'up';
  return (
    <span className="kpi-foot">
      <span className={`delta ${up ? 'delta-up' : 'delta-down'}`}>
        <Icon name={up ? 'arrow-up-right' : 'arrow-down-right'} size={13} strokeWidth={2.4} />
        {d.pct.toFixed(1)}%
      </span>
      <span className="t-muted">{suffix}</span>
    </span>
  );
}

function Spark({ series, color }: { series: number[]; color: string }) {
  const sp = sparkPath(series);
  if (!sp) return null;
  return (
    <svg className="spark" viewBox="0 0 200 36" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sp-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={sp.area} fill={`url(#sp-${color})`} />
      <path d={sp.line} fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

export interface KpiRowProps {
  summary: AnalyticsSummary;
  prev: AnalyticsSummary | null;
  credits: CreditsResponse | null;
  genSeries: number[];
  ctaSeries: number[];
}

export function KpiRow({ summary, prev, credits, genSeries, ctaSeries }: KpiRowProps) {
  const meter = credits ? creditMeter(credits.balance, credits.included) : null;
  const ctaShare = summary.generations > 0 ? summary.ctaClicks / summary.generations : 0;
  const ptsDelta = prev ? (summary.successRate - prev.successRate) * 100 : null;

  return (
    <div className="kpi-row">
      {/* Generations */}
      <div className="kpi">
        <div className="kpi-body">
          <div className="kpi-label">
            <Icon name="generations" size={15} strokeWidth={1.8} />
            Generations
          </div>
          <div className="kpi-value tnum">{groupThousands(summary.generations)}</div>
          {prev ? <DeltaChip d={delta(summary.generations, prev.generations)} /> : null}
        </div>
        <Spark series={genSeries} color="var(--accent)" />
      </div>

      {/* Success rate */}
      <div className="kpi">
        <div className="kpi-body">
          <div className="kpi-label">
            <Icon name="dot" size={15} strokeWidth={1.8} />
            Success rate
          </div>
          <div className="kpi-value tnum">{pct(summary.successRate)}</div>
          {ptsDelta !== null ? (
            <span className="kpi-foot">
              <span className={`delta ${ptsDelta >= 0 ? 'delta-up' : 'delta-down'}`}>
                <Icon
                  name={ptsDelta >= 0 ? 'arrow-up-right' : 'arrow-down-right'}
                  size={13}
                  strokeWidth={2.4}
                />
                {Math.abs(ptsDelta).toFixed(1)} pts
              </span>
              <span className="t-muted">vs last period</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* CTA clicks */}
      <div className="kpi">
        <div className="kpi-body">
          <div className="kpi-label">
            <Icon name="billing" size={15} strokeWidth={1.8} />
            CTA clicks
          </div>
          <div className="kpi-value tnum">{groupThousands(summary.ctaClicks)}</div>
          <span className="kpi-foot">
            <span className="t-secondary w-600">{pct(ctaShare)}</span>
            <span className="t-muted">of results</span>
          </span>
        </div>
        <Spark series={ctaSeries} color="var(--viz-3)" />
      </div>

      {/* Credits remaining */}
      <div className="kpi">
        <div className="kpi-body">
          <div className="kpi-label">
            <Icon name="billing" size={15} strokeWidth={1.8} />
            Credits remaining
          </div>
          <div className="kpi-value tnum">{credits ? compact(credits.balance) : '—'}</div>
          {credits && meter ? (
            <span className="kpi-foot">
              <span className={meter.level === 'ok' ? 't-secondary w-600' : 't-warning w-600'}>
                {meter.usedPct}% used
              </span>
              {credits.resetsAt ? (
                <span className="t-muted">resets {shortDate(new Date(credits.resetsAt))}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

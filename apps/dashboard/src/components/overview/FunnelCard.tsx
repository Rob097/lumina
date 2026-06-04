import { Icon } from '@/components/ui/Icon';
import { compact, pct } from '@/lib/format';
import { buildFunnel, type FunnelInput } from '@/lib/overview';

const STEP_ICON: Record<string, string> = {
  impressions: 'dot',
  opens: 'script',
  generations: 'overview',
  ctaClicks: 'billing',
};
// A cool→accent ramp down the funnel.
const STEP_FILL = ['var(--viz-1)', '#2f7bf0', '#4f8bf2', 'var(--viz-3)'];

export function FunnelCard({ summary }: { summary: FunnelInput }) {
  const steps = buildFunnel(summary);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Conversion funnel</h3>
        <span className="badge badge-neutral">30 days</span>
      </div>
      <div className="card-pad">
        <div className="funnel">
          {steps.map((step, i) => (
            <div
              key={step.key}
              className="funnel-step"
              style={{ gridTemplateColumns: '150px 1fr 96px' }}
            >
              <div className="fl">
                <span className="ic">
                  <Icon name={STEP_ICON[step.key] ?? 'dot'} size={15} strokeWidth={1.8} />
                </span>
                {step.label}
              </div>
              <div className="fbar-track">
                <div
                  className="fbar"
                  style={{ width: `${Math.max(step.widthPct, step.value > 0 ? 3 : 0)}%`, background: STEP_FILL[i] }}
                />
              </div>
              <div className="fv">
                <div className="n tnum">{compact(step.value)}</div>
                <div className="cr">{step.rate === null ? '—' : pct(step.rate)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

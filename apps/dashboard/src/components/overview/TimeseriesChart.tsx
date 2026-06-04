'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeseriesPoint } from '@lumina/shared';
import { shortDate } from '@/lib/format';

/** Generations (area) + CTA clicks (line) over time — Recharts styled with the --viz-* tokens (D30). */
export function TimeseriesChart({ points }: { points: TimeseriesPoint[] }) {
  const data = points.map((p) => ({ ...p, label: shortDate(new Date(p.t)) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="ov-gen-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
        />
        <Tooltip
          cursor={{ stroke: 'var(--border-strong)' }}
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontSize: 12,
            boxShadow: 'var(--e-3)',
            color: 'var(--text)',
          }}
          labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
        />
        <Area
          type="monotone"
          dataKey="generations"
          name="Generations"
          stroke="var(--accent)"
          strokeWidth={2.4}
          fill="url(#ov-gen-area)"
        />
        <Line
          type="monotone"
          dataKey="ctaClicks"
          name="CTA clicks"
          stroke="var(--viz-3)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

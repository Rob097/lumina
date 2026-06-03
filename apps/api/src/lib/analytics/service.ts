import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { generations, products, usageEvents, type Database } from '@lumina/db';
import type { AnalyticsSummary, TimeseriesResponse, TimeseriesInterval } from '@lumina/shared';

/**
 * Dashboard analytics (§6.3), computed from `usage_events` + `generations`. Every query is scoped by
 * `merchant_id` (HARD RULE #1). Metrics use the event types the widget actually emits (impression /
 * open / cta) plus the generations table for volume + success rate — no fabricated numbers (D29).
 */
export interface Range {
  from: Date;
  to: Date;
}

/** Resolve `?from`/`?to` (ISO) from a request URL, defaulting to the last 30 days. */
export function parseRange(url: URL, now = new Date()): Range {
  const toParam = url.searchParams.get('to');
  const fromParam = url.searchParams.get('from');
  const to = toParam ? new Date(toParam) : now;
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function summary(db: Database, merchantId: string, range: Range): Promise<AnalyticsSummary> {
  const inEvents = and(
    eq(usageEvents.merchantId, merchantId),
    gte(usageEvents.createdAt, range.from),
    lt(usageEvents.createdAt, range.to),
  );
  const inGens = and(
    eq(generations.merchantId, merchantId),
    gte(generations.createdAt, range.from),
    lt(generations.createdAt, range.to),
  );

  const eventRows = await db
    .select({ type: usageEvents.type, n: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(inEvents)
    .groupBy(usageEvents.type);
  const byType = new Map(eventRows.map((r) => [r.type, r.n]));

  const [g] = await db
    .select({
      total: sql<number>`count(*)::int`,
      succeeded: sql<number>`(count(*) filter (where ${generations.status} = 'succeeded'))::int`,
    })
    .from(generations)
    .where(inGens);
  const generationsTotal = g?.total ?? 0;
  const succeeded = g?.succeeded ?? 0;

  const topRows = await db
    .select({
      id: products.id,
      name: products.name,
      category: products.category,
      generations: sql<number>`count(${generations.id})::int`,
      succeeded: sql<number>`(count(*) filter (where ${generations.status} = 'succeeded'))::int`,
    })
    .from(generations)
    .innerJoin(products, eq(generations.productId, products.id))
    .where(inGens)
    .groupBy(products.id, products.name, products.category)
    .orderBy(desc(sql`count(${generations.id})`))
    .limit(5);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    impressions: byType.get('impression') ?? 0,
    opens: byType.get('open') ?? 0,
    generations: generationsTotal,
    ctaClicks: byType.get('cta') ?? 0,
    successRate: generationsTotal > 0 ? succeeded / generationsTotal : 0,
    topProducts: topRows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      generations: r.generations,
      successRate: r.generations > 0 ? r.succeeded / r.generations : 0,
    })),
  };
}

export async function timeseries(
  db: Database,
  merchantId: string,
  opts: Range & { interval?: TimeseriesInterval },
): Promise<TimeseriesResponse> {
  const interval: TimeseriesInterval = opts.interval ?? 'day';
  const trunc = interval === 'week' ? 'week' : 'day';
  const bucket = (col: typeof generations.createdAt | typeof usageEvents.createdAt) =>
    sql<string>`to_char(date_trunc(${trunc}, ${col}), 'YYYY-MM-DD')`;

  const genRows = await db
    .select({ t: bucket(generations.createdAt), n: sql<number>`count(*)::int` })
    .from(generations)
    .where(
      and(
        eq(generations.merchantId, merchantId),
        gte(generations.createdAt, opts.from),
        lt(generations.createdAt, opts.to),
      ),
    )
    .groupBy(sql`1`);

  const ctaRows = await db
    .select({ t: bucket(usageEvents.createdAt), n: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.merchantId, merchantId),
        eq(usageEvents.type, 'cta'),
        gte(usageEvents.createdAt, opts.from),
        lt(usageEvents.createdAt, opts.to),
      ),
    )
    .groupBy(sql`1`);

  const map = new Map<string, { generations: number; ctaClicks: number }>();
  for (const r of genRows) map.set(r.t, { generations: r.n, ctaClicks: 0 });
  for (const r of ctaRows) {
    const e = map.get(r.t) ?? { generations: 0, ctaClicks: 0 };
    e.ctaClicks = r.n;
    map.set(r.t, e);
  }

  const points = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, v]) => ({ t, generations: v.generations, ctaClicks: v.ctaClicks }));

  return { interval, points };
}

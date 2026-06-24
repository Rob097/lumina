import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { generations, type Database } from '@lumina/db';

/**
 * Real cost / margin aggregation (TODO #6). Sums the **real** provider cost (`cost_micros`, read live from
 * the AI Gateway) over succeeded generations, broken down by model. This is an internal margin primitive —
 * it reveals OUR cost, so any endpoint exposing it must be gated to the internal `support` role (Phase 4),
 * never to a regular merchant. Scoped by `merchant_id` when given (HARD RULE #1).
 */
export interface CostByModel {
  model: string | null;
  generations: number;
  /** Total real cost for this model in USD millionths. */
  costMicros: number;
}

export interface CostSummary {
  generations: number;
  /** Total real cost across all models in USD millionths. */
  totalCostMicros: number;
  /** Average real cost per generation in USD millionths (0 when there are none). */
  avgCostMicros: number;
  byModel: CostByModel[];
}

export interface CostSummaryFilter {
  merchantId?: string;
  since?: Date;
  until?: Date;
}

export async function costSummary(db: Database, filter: CostSummaryFilter = {}): Promise<CostSummary> {
  const where = [eq(generations.status, 'succeeded'), isNotNull(generations.costMicros)];
  if (filter.merchantId) where.push(eq(generations.merchantId, filter.merchantId));
  if (filter.since) where.push(gte(generations.createdAt, filter.since));
  if (filter.until) where.push(lt(generations.createdAt, filter.until));

  const rows = await db
    .select({
      model: generations.model,
      generations: sql<number>`count(*)::int`,
      costMicros: sql<number>`coalesce(sum(${generations.costMicros}), 0)::bigint`,
    })
    .from(generations)
    .where(and(...where))
    .groupBy(generations.model);

  const byModel: CostByModel[] = rows.map((r) => ({
    model: r.model,
    generations: Number(r.generations),
    costMicros: Number(r.costMicros),
  }));
  const generationsTotal = byModel.reduce((n, r) => n + r.generations, 0);
  const totalCostMicros = byModel.reduce((n, r) => n + r.costMicros, 0);
  return {
    generations: generationsTotal,
    totalCostMicros,
    avgCostMicros: generationsTotal > 0 ? Math.round(totalCostMicros / generationsTotal) : 0,
    byModel: byModel.sort((a, b) => b.costMicros - a.costMicros),
  };
}

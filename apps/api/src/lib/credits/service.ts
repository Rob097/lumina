import { desc, eq, sql } from 'drizzle-orm';
import { creditLedger, merchants, type Database } from '@lumina/db';
import { PLAN_CATALOG, type CreditsResponse, type LedgerEntry } from '@lumina/shared';

/**
 * Credits view for the dashboard (§6.3 `/credits`). Balance is the authoritative ledger sum; `included`
 * is the plan's monthly allotment (PLAN_CATALOG); `used` drives the meter. Every query is scoped by
 * `merchant_id` (HARD RULE #1). `resetsAt` is the next monthly cycle (UTC) — we grant on renewal.
 */
function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function getCreditsView(
  db: Database,
  merchantId: string,
  opts: { ledgerLimit?: number; now?: Date } = {},
): Promise<CreditsResponse> {
  const [agg] = await db
    .select({ balance: sql<number>`coalesce(sum(${creditLedger.amount}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.merchantId, merchantId));
  const balance = agg?.balance ?? 0;

  const [m] = await db
    .select({ plan: merchants.plan })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  const included = m ? PLAN_CATALOG[m.plan].includedCredits : 0;
  const used = Math.max(0, included - balance);

  const rows = await db
    .select({
      id: creditLedger.id,
      amount: creditLedger.amount,
      reason: creditLedger.reason,
      note: creditLedger.note,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(eq(creditLedger.merchantId, merchantId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(opts.ledgerLimit ?? 50);

  const ledger: LedgerEntry[] = rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    reason: r.reason,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    balance,
    included,
    used,
    resetsAt: nextMonthStartUtc(opts.now ?? new Date()).toISOString(),
    ledger,
  };
}

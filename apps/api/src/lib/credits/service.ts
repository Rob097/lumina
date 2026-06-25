import { desc, eq } from 'drizzle-orm';
import { accounts, creditLedger, merchants, type Database } from '@lumina/db';
import { PLAN_CATALOG, type CreditsResponse, type LedgerEntry } from '@lumina/shared';

/**
 * Credits view for the dashboard (§6.3 `/credits`). Credits are pooled at the **account** level (Phase
 * 2), so the balance + plan come from the merchant's owning account and the ledger lists every shop's
 * activity for that shared pool. `included` is the plan's monthly allotment; `used` drives the meter.
 * `resetsAt` is the next monthly cycle (UTC) — we grant on renewal.
 */
function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export async function getCreditsView(
  db: Database,
  merchantId: string,
  opts: { ledgerLimit?: number; now?: Date } = {},
): Promise<CreditsResponse> {
  const [acc] = await db
    .select({ id: accounts.id, plan: accounts.plan, balance: accounts.creditsBalance })
    .from(merchants)
    .innerJoin(accounts, eq(merchants.accountId, accounts.id))
    .where(eq(merchants.id, merchantId))
    .limit(1);
  const balance = acc?.balance ?? 0;
  const included = acc ? PLAN_CATALOG[acc.plan].includedCredits : 0;
  const used = Math.max(0, included - balance);

  const rows = acc
    ? await db
        .select({
          id: creditLedger.id,
          amount: creditLedger.amount,
          reason: creditLedger.reason,
          note: creditLedger.note,
          createdAt: creditLedger.createdAt,
        })
        .from(creditLedger)
        .where(eq(creditLedger.accountId, acc.id))
        .orderBy(desc(creditLedger.createdAt))
        .limit(opts.ledgerLimit ?? 50)
    : [];

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

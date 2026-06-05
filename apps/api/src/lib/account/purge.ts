import { inArray, lt } from 'drizzle-orm';
import { generations, merchants, type Database } from '@lumina/db';

/**
 * Data erasure + retention (§9 privacy, HARD RULE #9). GDPR Art. 17 erasure deletes the merchant row —
 * every tenant table cascades on `merchant_id` — plus all R2 objects under the merchant's prefixes.
 * Retention purges old generations + their image objects; the credit ledger survives because
 * `generation_id` is `ON DELETE SET NULL`, so balances stay intact.
 */
const OBJECT_ROOTS = ['rooms', 'products', 'results'] as const;

export interface MerchantPurgeStorage {
  /** Delete every object under a key prefix; returns how many were removed. */
  deleteByPrefix(prefix: string): Promise<number>;
}

export interface RetentionStorage {
  deleteObject(key: string): Promise<void>;
}

export async function purgeMerchant(
  db: Database,
  storage: MerchantPurgeStorage,
  merchantId: string,
): Promise<{ objectsDeleted: number }> {
  let objectsDeleted = 0;
  for (const root of OBJECT_ROOTS) {
    objectsDeleted += await storage.deleteByPrefix(`${root}/${merchantId}/`);
  }
  // Cascades to memberships, products, widget_configs, api_keys, generations, credit_ledger, usage_events…
  await db.delete(merchants).where(inArray(merchants.id, [merchantId]));
  return { objectsDeleted };
}

export async function purgeGenerationsOlderThan(
  db: Database,
  storage: RetentionStorage,
  opts: { olderThanDays: number; now?: Date },
): Promise<{ generations: number; objects: number }> {
  const cutoff = new Date((opts.now ?? new Date()).getTime() - opts.olderThanDays * 86_400_000);
  const rows = await db
    .select({ id: generations.id, roomKey: generations.roomKey, resultKey: generations.resultKey })
    .from(generations)
    .where(lt(generations.createdAt, cutoff));

  let objects = 0;
  for (const r of rows) {
    for (const key of [r.roomKey, r.resultKey]) {
      if (key) {
        await storage.deleteObject(key).catch(() => {}); // best-effort; never block the purge
        objects += 1;
      }
    }
  }
  if (rows.length > 0) {
    await db.delete(generations).where(
      inArray(
        generations.id,
        rows.map((r) => r.id),
      ),
    );
  }
  return { generations: rows.length, objects };
}

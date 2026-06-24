import { and, inArray, isNull, lt } from 'drizzle-orm';
import { generations, merchants, type Database } from '@lumina/db';

/**
 * Data erasure + retention (§9 privacy, HARD RULE #9).
 *
 * - GDPR Art. 17 erasure (`purgeMerchant`) deletes the merchant row — every tenant table cascades on
 *   `merchant_id` — plus all R2 objects under the merchant's prefixes (including thumbnails).
 * - Retention (`purgeExpiredAssets`) deletes only the heavy R2 ORIGINALS (room uploads + results) past
 *   their window and flags the row; the generation ROW, its metadata, and the small long-lived thumbnail
 *   all survive so the dashboard keeps its history. Rooms purge sooner than results (privacy). The credit
 *   ledger is untouched (`generation_id` is `ON DELETE SET NULL`, and rows are no longer deleted at all).
 */
const OBJECT_ROOTS = ['rooms', 'products', 'results', 'thumbs'] as const;

/** How many rows to process per query, so a single cron run is bounded. */
const BATCH_SIZE = 500;

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

/**
 * Tiered, row-preserving retention purge. Deletes the room originals older than `roomDays` and the result
 * originals older than `resultDays`, flagging each row (`room_purged_at` / `originals_purged_at`) so it's
 * never re-processed. Thumbnails and rows are kept. Returns the counts processed.
 */
export async function purgeExpiredAssets(
  db: Database,
  storage: RetentionStorage,
  opts: { roomDays: number; resultDays: number; now?: Date },
): Promise<{ rooms: number; results: number; objects: number }> {
  const now = opts.now ?? new Date();
  const roomCutoff = new Date(now.getTime() - opts.roomDays * 86_400_000);
  const resultCutoff = new Date(now.getTime() - opts.resultDays * 86_400_000);

  let rooms = 0;
  let results = 0;
  let objects = 0;

  // Rooms (private user uploads) — the shorter window.
  for (;;) {
    const batch = await db
      .select({ id: generations.id, key: generations.roomKey })
      .from(generations)
      .where(
        and(
          isNull(generations.roomPurgedAt),
          lt(generations.createdAt, roomCutoff),
        ),
      )
      .limit(BATCH_SIZE);
    const withKey = batch.filter((r) => r.key);
    for (const r of withKey) {
      await storage.deleteObject(r.key!).catch(() => {}); // best-effort; never block the purge
      objects += 1;
    }
    if (batch.length > 0) {
      await db
        .update(generations)
        .set({ roomPurgedAt: now })
        .where(inArray(generations.id, batch.map((r) => r.id)));
      rooms += batch.length;
    }
    if (batch.length < BATCH_SIZE) break;
  }

  // Results — the longer window. The thumbnail (thumb_key) is intentionally NOT deleted.
  for (;;) {
    const batch = await db
      .select({ id: generations.id, key: generations.resultKey })
      .from(generations)
      .where(
        and(
          isNull(generations.originalsPurgedAt),
          lt(generations.createdAt, resultCutoff),
        ),
      )
      .limit(BATCH_SIZE);
    const withKey = batch.filter((r) => r.key);
    for (const r of withKey) {
      await storage.deleteObject(r.key!).catch(() => {});
      objects += 1;
    }
    if (batch.length > 0) {
      await db
        .update(generations)
        .set({ originalsPurgedAt: now })
        .where(inArray(generations.id, batch.map((r) => r.id)));
      results += batch.length;
    }
    if (batch.length < BATCH_SIZE) break;
  }

  return { rooms, results, objects };
}

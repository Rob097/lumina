import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { memberships, merchants, type Database } from '@lumina/db';

const UuidSchema = z.string().uuid();

/**
 * The internal platform-support account ids, from `LUMINA_SUPPORT_USER_IDS` (comma-separated
 * `auth.users` UUIDs). These accounts are auto-enrolled as hidden `role='support'` members of every
 * workspace (super-admin, no billing). Invalid/blank entries are dropped; the result is deduped.
 */
export function platformSupportUserIds(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.LUMINA_SUPPORT_USER_IDS ?? '';
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id && UuidSchema.safeParse(id).success) {
      seen.add(id);
    }
  }
  return [...seen];
}

/**
 * Enroll each configured support account as a `role='support'` member of `merchantId`. Idempotent
 * (unique merchant+user → `onConflictDoNothing`). FAIL-SAFE: each id is inserted independently and a
 * failure (e.g. an id absent from `auth.users` → FK violation) is swallowed so it can never break the
 * caller (workspace creation). `excludeUserId` skips the case where the creator is itself a support
 * account. Returns the number of rows actually inserted.
 */
export async function enrollPlatformSupport(
  db: Database,
  merchantId: string,
  opts: { excludeUserId?: string; env?: Record<string, string | undefined> } = {},
): Promise<number> {
  const ids = platformSupportUserIds(opts.env).filter((id) => id !== opts.excludeUserId);
  let enrolled = 0;
  for (const userId of ids) {
    try {
      const rows = await db
        .insert(memberships)
        .values({ merchantId, userId, role: 'support' })
        .onConflictDoNothing()
        .returning({ id: memberships.id });
      enrolled += rows.length;
    } catch {
      // A misconfigured support id (not a real auth.users row, etc.) must never break the caller.
    }
  }
  return enrolled;
}

/**
 * Backfill: ensure every existing merchant has a `role='support'` membership for each configured support
 * account. Idempotent and re-runnable (e.g. after adding a new internal account). A bad id is skipped;
 * the rest still sync. Returns the configured ids + total rows inserted.
 */
export async function syncPlatformSupport(
  db: Database,
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<{ supportIds: string[]; enrolled: number }> {
  const supportIds = platformSupportUserIds(opts.env);
  let enrolled = 0;
  for (const userId of supportIds) {
    try {
      const rows = await db.execute(sql`
        insert into ${memberships} (merchant_id, user_id, role)
        select ${merchants}.id, ${userId}::uuid, 'support'
        from ${merchants}
        on conflict (merchant_id, user_id) do nothing
        returning user_id
      `);
      enrolled += (rows as unknown as unknown[]).length;
    } catch {
      // Skip a bad id (e.g. not in auth.users); the rest still sync.
    }
  }
  return { supportIds, enrolled };
}

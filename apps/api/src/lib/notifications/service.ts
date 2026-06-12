import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { pgSchema, text, uuid } from 'drizzle-orm/pg-core';
import { memberships, notificationPrefs, notifications, type Database } from '@lumina/db';
import {
  DEFAULT_NOTIFICATION_PREFS,
  channelsFor,
  type Notification,
  type NotificationPrefs,
  type NotificationType,
} from '@lumina/shared';
import type { EmailSender } from '../email/index.js';

/** Read-only handle to the Supabase-managed `auth.users` (member emails); drizzle-kit never sees it. */
const authUsers = pgSchema('auth').table('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
});

export interface NotificationDeps {
  email: EmailSender;
}

export interface NotifyInput {
  merchantId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /** Optional richer email payload; falls back to title/body. */
  email?: { subject?: string; html?: string };
}

type NotificationRow = typeof notifications.$inferSelect;

function toDto(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function emailHtml(input: NotifyInput): string {
  return input.email?.html ?? `<p>${input.title}</p>${input.body ? `<p>${input.body}</p>` : ''}`;
}

/**
 * Emit a notification to every member of a merchant, fanned out to per-user rows so read-state is
 * per-member. Honors each member's channel prefs (defaults: in-app + email on). Email is best-effort —
 * a send failure never throws, so a producer (e.g. a failed generation that must still refund) is safe.
 */
export async function notifyMerchant(
  db: Database,
  deps: NotificationDeps,
  input: NotifyInput,
): Promise<void> {
  const members = await db
    .select({ userId: memberships.userId, email: authUsers.email })
    .from(memberships)
    .leftJoin(authUsers, eq(authUsers.id, memberships.userId))
    .where(eq(memberships.merchantId, input.merchantId));
  if (members.length === 0) {
    return;
  }

  const prefRows = await db
    .select()
    .from(notificationPrefs)
    .where(eq(notificationPrefs.merchantId, input.merchantId));
  const prefByUser = new Map(prefRows.map((r) => [r.userId, r.prefs]));

  const rows: (typeof notifications.$inferInsert)[] = [];
  const outbox: { to: string; subject: string; html: string; text?: string }[] = [];
  for (const m of members) {
    const ch = channelsFor(prefByUser.get(m.userId), input.type);
    if (ch.inApp) {
      rows.push({
        merchantId: input.merchantId,
        userId: m.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        data: input.data ?? {},
      });
    }
    if (ch.email && m.email) {
      outbox.push({
        to: m.email,
        subject: input.email?.subject ?? input.title,
        html: emailHtml(input),
        ...(input.body ? { text: input.body } : {}),
      });
    }
  }

  if (rows.length > 0) {
    await db.insert(notifications).values(rows);
  }
  // Best-effort: email is never allowed to break the producer.
  await Promise.allSettled(outbox.map((msg) => deps.email.send(msg)));
}

export interface ListArgs {
  userId: string;
  merchantId: string;
  limit?: number;
}

export async function listNotifications(
  db: Database,
  { userId, merchantId, limit = 20 }: ListArgs,
): Promise<{ notifications: Notification[]; unread: number }> {
  const scope = and(eq(notifications.userId, userId), eq(notifications.merchantId, merchantId));
  const rows = await db
    .select()
    .from(notifications)
    .where(scope)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [{ count = 0 } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(scope, isNull(notifications.readAt)));
  return { notifications: rows.map(toDto), unread: Number(count) };
}

export interface MarkReadArgs {
  userId: string;
  merchantId: string;
  ids?: string[];
  all?: boolean;
}

export async function markRead(db: Database, args: MarkReadArgs): Promise<void> {
  const scope = and(
    eq(notifications.userId, args.userId),
    eq(notifications.merchantId, args.merchantId),
    isNull(notifications.readAt),
  );
  if (args.all) {
    await db.update(notifications).set({ readAt: new Date() }).where(scope);
    return;
  }
  const ids = args.ids ?? [];
  if (ids.length === 0) {
    return;
  }
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(scope, inArray(notifications.id, ids)));
}

export interface PrefsArgs {
  userId: string;
  merchantId: string;
}

/** Effective prefs = shipped defaults overlaid with the member's stored overrides. */
export async function getPrefs(
  db: Database,
  { userId, merchantId }: PrefsArgs,
): Promise<Record<NotificationType, { inApp: boolean; email: boolean }>> {
  const rows = await db
    .select()
    .from(notificationPrefs)
    .where(and(eq(notificationPrefs.merchantId, merchantId), eq(notificationPrefs.userId, userId)))
    .limit(1);
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(rows[0]?.prefs ?? {}) };
}

export async function setPrefs(
  db: Database,
  args: PrefsArgs & { prefs: NotificationPrefs },
): Promise<Record<NotificationType, { inApp: boolean; email: boolean }>> {
  await db
    .insert(notificationPrefs)
    .values({ merchantId: args.merchantId, userId: args.userId, prefs: args.prefs })
    .onConflictDoUpdate({
      target: [notificationPrefs.merchantId, notificationPrefs.userId],
      set: { prefs: args.prefs, updatedAt: new Date() },
    });
  return getPrefs(db, args);
}

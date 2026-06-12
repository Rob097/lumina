import { randomUUID } from 'node:crypto';
import { memberships, merchants, notifications } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage, EmailSender } from '../src/lib/email/index.js';
import {
  getPrefs,
  listNotifications,
  markRead,
  notifyMerchant,
  setPrefs,
} from '../src/lib/notifications/service.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx?.teardown();
});

/** Captures sent email so we can assert on delivery without a network call. */
function fakeSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return { sent, async send(msg) { sent.push(msg); } };
}

async function newMerchant(): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Co', slug: `co-${randomUUID()}`, plan: 'growth' })
    .returning();
  return firstOrThrow(rows).id;
}
async function newMember(merchantId: string, email: string): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${email})`);
  await ctx.db.insert(memberships).values({ merchantId, userId: id, role: 'member' });
  return id;
}

beforeEach(async () => {
  await ctx.db.delete(notifications);
});

describe('notifyMerchant', () => {
  it('fans out one in-app row + one email per member, by default', async () => {
    const m = await newMerchant();
    const a = await newMember(m, 'a@store.it');
    const b = await newMember(m, 'b@store.it');
    const email = fakeSender();

    await notifyMerchant(ctx.db, { email }, {
      merchantId: m,
      type: 'generation_failed',
      title: 'A preview failed',
      body: 'We refunded the credit.',
      data: { generationId: 'g1' },
    });

    const listA = await listNotifications(ctx.db, { userId: a, merchantId: m });
    const listB = await listNotifications(ctx.db, { userId: b, merchantId: m });
    expect(listA.notifications).toHaveLength(1);
    expect(listB.notifications).toHaveLength(1);
    expect(listA.notifications[0]?.type).toBe('generation_failed');
    expect(email.sent.map((e) => e.to).sort()).toEqual(['a@store.it', 'b@store.it']);
  });

  it('honors per-member prefs (mute email, mute in-app)', async () => {
    const m = await newMerchant();
    const muteEmail = await newMember(m, 'noemail@store.it');
    const muteInApp = await newMember(m, 'noinapp@store.it');
    await setPrefs(ctx.db, { userId: muteEmail, merchantId: m, prefs: { low_credits: { inApp: true, email: false } } });
    await setPrefs(ctx.db, { userId: muteInApp, merchantId: m, prefs: { low_credits: { inApp: false, email: true } } });
    const email = fakeSender();

    await notifyMerchant(ctx.db, { email }, { merchantId: m, type: 'low_credits', title: 'Low on credits' });

    expect((await listNotifications(ctx.db, { userId: muteEmail, merchantId: m })).notifications).toHaveLength(1);
    expect((await listNotifications(ctx.db, { userId: muteInApp, merchantId: m })).notifications).toHaveLength(0);
    expect(email.sent.map((e) => e.to)).toEqual(['noinapp@store.it']);
  });

  it('an email send failure never throws to the caller (in-app still lands)', async () => {
    const m = await newMerchant();
    const a = await newMember(m, 'a@store.it');
    const boom: EmailSender = { async send() { throw new Error('resend down'); } };

    await expect(
      notifyMerchant(ctx.db, { email: boom }, { merchantId: m, type: 'payment_failed', title: 'Payment failed' }),
    ).resolves.toBeUndefined();
    expect((await listNotifications(ctx.db, { userId: a, merchantId: m })).notifications).toHaveLength(1);
  });
});

describe('listNotifications + markRead', () => {
  it('lists newest-first with an unread count, and marks read', async () => {
    const m = await newMerchant();
    const a = await newMember(m, 'a@store.it');
    const email = fakeSender();
    await notifyMerchant(ctx.db, { email }, { merchantId: m, type: 'low_credits', title: 'first' });
    await notifyMerchant(ctx.db, { email }, { merchantId: m, type: 'generation_failed', title: 'second' });

    const before = await listNotifications(ctx.db, { userId: a, merchantId: m });
    expect(before.unread).toBe(2);
    expect(before.notifications[0]?.title).toBe('second'); // newest first

    await markRead(ctx.db, { userId: a, merchantId: m, all: true });
    expect((await listNotifications(ctx.db, { userId: a, merchantId: m })).unread).toBe(0);
  });

  it('markRead with ids only marks those', async () => {
    const m = await newMerchant();
    const a = await newMember(m, 'a@store.it');
    const email = fakeSender();
    await notifyMerchant(ctx.db, { email }, { merchantId: m, type: 'low_credits', title: 'one' });
    await notifyMerchant(ctx.db, { email }, { merchantId: m, type: 'low_credits', title: 'two' });

    const list = await listNotifications(ctx.db, { userId: a, merchantId: m });
    const firstId = list.notifications[0]!.id;
    await markRead(ctx.db, { userId: a, merchantId: m, ids: [firstId] });
    expect((await listNotifications(ctx.db, { userId: a, merchantId: m })).unread).toBe(1);
  });

  it('a member never sees another member’s notifications', async () => {
    const m = await newMerchant();
    const a = await newMember(m, 'a@store.it');
    const b = await newMember(m, 'b@store.it');
    const email = fakeSender();
    await notifyMerchant(ctx.db, { email }, { merchantId: m, type: 'low_credits', title: 'x' });

    // Each member has exactly their own row.
    expect((await listNotifications(ctx.db, { userId: a, merchantId: m })).notifications).toHaveLength(1);
    expect((await listNotifications(ctx.db, { userId: b, merchantId: m })).notifications).toHaveLength(1);
    const aId = (await listNotifications(ctx.db, { userId: a, merchantId: m })).notifications[0]!.id;
    const bId = (await listNotifications(ctx.db, { userId: b, merchantId: m })).notifications[0]!.id;
    expect(aId).not.toBe(bId);
  });
});

describe('preferences', () => {
  it('returns shipped defaults until set, then persists overrides', async () => {
    const m = await newMerchant();
    const a = await newMember(m, 'a@store.it');

    const def = await getPrefs(ctx.db, { userId: a, merchantId: m });
    expect(def.low_credits).toEqual({ inApp: true, email: true });

    await setPrefs(ctx.db, { userId: a, merchantId: m, prefs: { low_credits: { inApp: true, email: false } } });
    const after = await getPrefs(ctx.db, { userId: a, merchantId: m });
    expect(after.low_credits).toEqual({ inApp: true, email: false });
    // untouched types still default-on
    expect(after.payment_failed).toEqual({ inApp: true, email: true });
  });
});

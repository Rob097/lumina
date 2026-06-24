import { randomUUID } from 'node:crypto';
import { invitations, memberships, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptInvitation,
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '../src/lib/account/invitations.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(): Promise<string> {
  return firstOrThrow(
    await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
  ).id;
}

// invited_by / membership.user_id are FKs to the Supabase-managed auth.users; seed a row per user.
async function newUser(email = `u-${randomUUID()}@x.test`): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${email})`);
  return id;
}
const inviter = () => newUser();

describe('invitations', () => {
  it('creates a pending invite and accepting it adds the user as a member with the invited role', async () => {
    const m = await newMerchant();
    const inv = await createInvitation(ctx.db, {
      merchantId: m,
      email: 'Teammate@Acme.test',
      role: 'support',
      invitedBy: await inviter(),
    });
    expect(inv.token).toBeTruthy();
    expect(inv.email).toBe('teammate@acme.test'); // normalized

    const userId = await newUser();
    const res = await acceptInvitation(ctx.db, { token: inv.token, userId });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.merchantId).toBe(m);

    const [member] = await ctx.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.merchantId, m), eq(memberships.userId, userId)));
    expect(member?.role).toBe('support');

    const [row] = await ctx.db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row?.status).toBe('accepted');
  });

  it('rejects an expired invite (and flags it expired)', async () => {
    const m = await newMerchant();
    const inv = await createInvitation(ctx.db, {
      merchantId: m,
      email: 'late@acme.test',
      role: 'member',
      invitedBy: await inviter(),
      now: new Date('2026-01-01T00:00:00Z'),
      ttlDays: 7,
    });
    const res = await acceptInvitation(ctx.db, {
      token: inv.token,
      userId: await newUser(),
      now: new Date('2026-02-01T00:00:00Z'),
    });
    expect(res).toEqual({ ok: false, reason: 'expired' });
    const [row] = await ctx.db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row?.status).toBe('expired');
  });

  it('rejects an unknown or revoked token', async () => {
    const m = await newMerchant();
    const inv = await createInvitation(ctx.db, {
      merchantId: m,
      email: 'rev@acme.test',
      role: 'member',
      invitedBy: await inviter(),
    });
    expect(await revokeInvitation(ctx.db, m, inv.id)).toBe(true);
    expect(await acceptInvitation(ctx.db, { token: inv.token, userId: await newUser() })).toEqual({
      ok: false,
      reason: 'revoked',
    });
    expect(await acceptInvitation(ctx.db, { token: 'nope', userId: await newUser() })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('lists a workspace invitations (newest first), scoped to the merchant', async () => {
    const m = await newMerchant();
    const other = await newMerchant();
    await createInvitation(ctx.db, { merchantId: m, email: 'a@x.test', role: 'member', invitedBy: await inviter() });
    await createInvitation(ctx.db, { merchantId: other, email: 'b@x.test', role: 'member', invitedBy: await inviter() });
    const list = await listInvitations(ctx.db, m);
    expect(list).toHaveLength(1);
    expect(list[0]?.email).toBe('a@x.test');
  });
});

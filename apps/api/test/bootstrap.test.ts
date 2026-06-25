import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { accounts, apiKeys, memberships, merchants, widgetConfigs } from '@lumina/db';
import { setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorkspace, ensureMerchantForUser, ShopLimitError } from '../src/lib/bootstrap.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newAuthUser(email: string): Promise<string> {
  const id = randomUUID();
  await ctx.sqlClient`insert into auth.users (id, email) values (${id}::uuid, ${email})`;
  return id;
}

describe('ensureMerchantForUser', () => {
  it('creates a merchant + owner membership + live key pair + active widget config on first login', async () => {
    const userId = await newAuthUser('jane@acme.com');
    const result = await ensureMerchantForUser(ctx.db, { userId, email: 'jane@acme.com' });

    expect(result.created).toBe(true);
    expect(result.keys).toHaveLength(2);
    // One live publishable + one live secret, raw revealed once.
    expect(result.keys.map((k) => `${k.kind}_${k.env}`).sort()).toEqual([
      'publishable_live',
      'secret_live',
    ]);

    const keyRows = await ctx.db.select().from(apiKeys).where(eq(apiKeys.merchantId, result.merchantId));
    expect(keyRows).toHaveLength(2);
    // The publishable key is stored as the public site_key so the install snippet self-fills.
    const pubRow = keyRows.find((k) => k.kind === 'publishable');
    expect(pubRow?.siteKey).toBeTruthy();
    expect(keyRows.find((k) => k.kind === 'secret')?.siteKey ?? null).toBeNull();
    const membershipRows = await ctx.db
      .select()
      .from(memberships)
      .where(eq(memberships.merchantId, result.merchantId));
    expect(membershipRows[0]?.role).toBe('owner');
    const configRows = await ctx.db
      .select()
      .from(widgetConfigs)
      .where(eq(widgetConfigs.merchantId, result.merchantId));
    expect(configRows).toHaveLength(1);
    expect(configRows[0]?.isActive).toBe(true);
  });

  it('is idempotent: a second login returns the same merchant and creates nothing new', async () => {
    const userId = await newAuthUser('repeat@acme.com');
    const first = await ensureMerchantForUser(ctx.db, { userId, email: 'repeat@acme.com' });
    const second = await ensureMerchantForUser(ctx.db, { userId, email: 'repeat@acme.com' });

    expect(second.created).toBe(false);
    expect(second.merchantId).toBe(first.merchantId);
    expect(second.keys).toHaveLength(0);

    const keyRows = await ctx.db.select().from(apiKeys).where(eq(apiKeys.merchantId, first.merchantId));
    expect(keyRows).toHaveLength(2); // not duplicated
  });

  it('handles duplicate slugs for different users with the same email local-part', async () => {
    const userA = await newAuthUser('sam@one.com');
    const userB = await newAuthUser('sam@two.com');
    const a = await ensureMerchantForUser(ctx.db, { userId: userA, email: 'sam@one.com' });
    const b = await ensureMerchantForUser(ctx.db, { userId: userB, email: 'sam@two.com' });
    expect(a.merchantId).not.toBe(b.merchantId);
  });
});

describe('accounts + shop cap', () => {
  async function accountId(userId: string): Promise<string> {
    const rows = await ctx.db.select().from(accounts).where(eq(accounts.ownerUserId, userId));
    const id = rows[0]?.id;
    if (!id) throw new Error('no account');
    return id;
  }

  it('creates a free billing account on first workspace and links the merchant', async () => {
    const userId = await newAuthUser('acct@acme.com');
    const res = await ensureMerchantForUser(ctx.db, { userId, email: 'acct@acme.com' });

    const accRows = await ctx.db.select().from(accounts).where(eq(accounts.ownerUserId, userId));
    expect(accRows).toHaveLength(1);
    expect(accRows[0]?.plan).toBe('free');

    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.id, res.merchantId));
    expect(m?.accountId).toBe(accRows[0]?.id);
  });

  it('rejects a second workspace on a free account (1 shop) and reuses the one account', async () => {
    const userId = await newAuthUser('cap@acme.com');
    await ensureMerchantForUser(ctx.db, { userId, email: 'cap@acme.com' });

    await expect(createWorkspace(ctx.db, { userId, name: 'Second shop' })).rejects.toBeInstanceOf(
      ShopLimitError,
    );
    const accRows = await ctx.db.select().from(accounts).where(eq(accounts.ownerUserId, userId));
    expect(accRows).toHaveLength(1);
    const merch = await ctx.db.select().from(merchants).where(eq(merchants.accountId, accRows[0]!.id));
    expect(merch).toHaveLength(1);
  });

  it('allows up to the plan allowance (pro = 3 shops), then caps', async () => {
    const userId = await newAuthUser('pro@acme.com');
    const first = await ensureMerchantForUser(ctx.db, { userId, email: 'pro@acme.com' });
    // Phase 2 sets the account plan via billing; here we set it directly to exercise the cap.
    await ctx.db.update(accounts).set({ plan: 'pro' }).where(eq(accounts.ownerUserId, userId));

    const second = await createWorkspace(ctx.db, { userId, name: 'Shop 2' });
    const third = await createWorkspace(ctx.db, { userId, name: 'Shop 3' });
    expect(new Set([first.merchantId, second.merchantId, third.merchantId]).size).toBe(3);

    await expect(createWorkspace(ctx.db, { userId, name: 'Shop 4' })).rejects.toBeInstanceOf(
      ShopLimitError,
    );
    const merch = await ctx.db.select().from(merchants).where(eq(merchants.accountId, await accountId(userId)));
    expect(merch).toHaveLength(3);
  });
});

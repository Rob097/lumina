import { randomUUID } from 'node:crypto';
import { accounts, memberships, merchants, subscriptions } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  WorkspaceDeleteError,
  deleteWorkspace,
} from '../src/lib/account/delete-workspace.js';
import type { MerchantPurgeStorage } from '../src/lib/account/purge.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

/** Records the prefixes asked to be deleted, so we can assert the R2 cleanup ran. */
function recordingStorage(): MerchantPurgeStorage & { prefixes: string[] } {
  const prefixes: string[] = [];
  return {
    prefixes,
    async deleteByPrefix(prefix: string) {
      prefixes.push(prefix);
      return 0;
    },
  };
}

async function newAccount(): Promise<string> {
  const userId = randomUUID();
  await ctx.sqlClient`insert into auth.users (id, email) values (${userId}::uuid, ${`u-${userId}@x.com`})`;
  const rows = await ctx.db.insert(accounts).values({ ownerUserId: userId, plan: 'pro' }).returning();
  return firstOrThrow(rows).id;
}

async function newMerchant(accountId: string, opts: { suspended?: boolean } = {}): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({
      name: `Shop ${randomUUID().slice(0, 6)}`,
      slug: `s-${randomUUID()}`,
      accountId,
      ...(opts.suspended ? { suspendedAt: new Date() } : {}),
    })
    .returning();
  return firstOrThrow(rows).id;
}

async function exists(merchantId: string): Promise<boolean> {
  const rows = await ctx.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.id, merchantId));
  return rows.length > 0;
}

describe('deleteWorkspace', () => {
  it('deletes an extra active workspace and removes its R2 prefixes', async () => {
    const accountId = await newAccount();
    const keep = await newMerchant(accountId);
    const target = await newMerchant(accountId);
    const storage = recordingStorage();

    await deleteWorkspace(ctx.db, storage, { merchantId: target, accountId });

    expect(await exists(target)).toBe(false);
    expect(await exists(keep)).toBe(true);
    expect(storage.prefixes).toEqual([
      `rooms/${target}/`,
      `products/${target}/`,
      `results/${target}/`,
      `thumbs/${target}/`,
    ]);
  });

  it('deletes a suspended workspace (an active one remains)', async () => {
    const accountId = await newAccount();
    await newMerchant(accountId); // the active one
    const suspended = await newMerchant(accountId, { suspended: true });

    await deleteWorkspace(ctx.db, recordingStorage(), { merchantId: suspended, accountId });
    expect(await exists(suspended)).toBe(false);
  });

  it('refuses to delete the only active workspace', async () => {
    const accountId = await newAccount();
    const only = await newMerchant(accountId);
    await newMerchant(accountId, { suspended: true }); // suspended sibling doesn't count as active

    await expect(
      deleteWorkspace(ctx.db, recordingStorage(), { merchantId: only, accountId }),
    ).rejects.toMatchObject({ reason: 'last_active' });
    expect(await exists(only)).toBe(true);
  });

  it('refuses to delete the workspace holding the live subscription', async () => {
    const accountId = await newAccount();
    const keep = await newMerchant(accountId);
    const billed = await newMerchant(accountId);
    await ctx.db.insert(subscriptions).values({
      merchantId: billed,
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_live',
      plan: 'pro',
      status: 'active',
    });

    await expect(
      deleteWorkspace(ctx.db, recordingStorage(), { merchantId: billed, accountId }),
    ).rejects.toBeInstanceOf(WorkspaceDeleteError);
    expect(await exists(billed)).toBe(true);
    expect(await exists(keep)).toBe(true);
  });

  it('allows deleting a workspace with only a customer-only subscription row (no live sub)', async () => {
    const accountId = await newAccount();
    await newMerchant(accountId); // active sibling stays
    const target = await newMerchant(accountId);
    await ctx.db.insert(subscriptions).values({
      merchantId: target,
      stripeCustomerId: 'cus_incomplete',
      stripeSubscriptionId: null,
      plan: 'free',
      status: 'incomplete',
    });

    await deleteWorkspace(ctx.db, recordingStorage(), { merchantId: target, accountId });
    expect(await exists(target)).toBe(false);
  });

  it("rejects a target that isn't in the account", async () => {
    const accountId = await newAccount();
    await newMerchant(accountId);
    const otherAccount = await newAccount();
    const foreign = await newMerchant(otherAccount);

    await expect(
      deleteWorkspace(ctx.db, recordingStorage(), { merchantId: foreign, accountId }),
    ).rejects.toMatchObject({ reason: 'not_found' });
    expect(await exists(foreign)).toBe(true);
  });

  it('cascade-deletes the workspace membership', async () => {
    const accountId = await newAccount();
    await newMerchant(accountId);
    const target = await newMerchant(accountId);
    const userId = randomUUID();
    await ctx.sqlClient`insert into auth.users (id, email) values (${userId}::uuid, ${`m-${userId}@x.com`})`;
    await ctx.db.insert(memberships).values({ merchantId: target, userId, role: 'member' });

    await deleteWorkspace(ctx.db, recordingStorage(), { merchantId: target, accountId });
    const rows = await ctx.db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(eq(memberships.merchantId, target));
    expect(rows).toEqual([]);
  });
});

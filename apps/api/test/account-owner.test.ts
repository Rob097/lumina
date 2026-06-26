import { randomUUID } from 'node:crypto';
import { accounts, memberships, merchants } from '@lumina/db';
import { setupTestDb, firstOrThrow, type TestDb } from '@lumina/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAccountOwner } from '../src/lib/account/account-owner.js';

let ctx: TestDb;
beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx?.teardown();
});

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@x.test`})`);
  return id;
}

describe('isAccountOwner', () => {
  it('is true for the account owner and false for a non-owner member', async () => {
    const owner = await newUser();
    const other = await newUser();
    const acc = firstOrThrow(await ctx.db.insert(accounts).values({ ownerUserId: owner }).returning());
    const m = firstOrThrow(
      await ctx.db
        .insert(merchants)
        .values({ name: 'Co', slug: `co-${randomUUID()}`, accountId: acc.id })
        .returning(),
    );
    await ctx.db.insert(memberships).values({ merchantId: m.id, userId: owner, role: 'owner' });
    await ctx.db.insert(memberships).values({ merchantId: m.id, userId: other, role: 'support' });

    expect(await isAccountOwner(ctx.db, m.id, owner)).toBe(true);
    expect(await isAccountOwner(ctx.db, m.id, other)).toBe(false);
  });

  it('is false when the merchant has no account', async () => {
    const u = await newUser();
    const m = firstOrThrow(
      await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
    );
    expect(await isAccountOwner(ctx.db, m.id, u)).toBe(false);
  });
});

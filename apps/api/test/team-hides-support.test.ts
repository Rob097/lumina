import { randomUUID } from 'node:crypto';
import { memberships, merchants } from '@lumina/db';
import { setupTestDb, firstOrThrow, type TestDb } from '@lumina/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTeam } from '../src/lib/account/service.js';

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

describe('listTeam', () => {
  it('hides role=support members from the workspace member list', async () => {
    const owner = await newUser();
    const support = await newUser();
    const m = firstOrThrow(
      await ctx.db.insert(merchants).values({ name: 'Co', slug: `co-${randomUUID()}` }).returning(),
    ).id;
    await ctx.db.insert(memberships).values({ merchantId: m, userId: owner, role: 'owner' });
    await ctx.db.insert(memberships).values({ merchantId: m, userId: support, role: 'support' });

    const team = await listTeam(ctx.db, m);
    const ids = team.map((t) => t.userId);
    expect(ids).toContain(owner);
    expect(ids).not.toContain(support);
  });
});

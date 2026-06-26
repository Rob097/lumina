import { randomUUID } from 'node:crypto';
import { memberships } from '@lumina/db';
import { setupTestDb, type TestDb } from '@lumina/db/testing';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createWorkspace } from '../src/lib/bootstrap.js';

let ctx: TestDb;
beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx?.teardown();
});
afterEach(() => {
  delete process.env.LUMINA_SUPPORT_USER_IDS;
});

async function newUser(): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${`${id}@x.test`})`);
  return id;
}
async function roleOf(merchantId: string, userId: string): Promise<string | undefined> {
  const [r] = await ctx.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.merchantId, merchantId), eq(memberships.userId, userId)))
    .limit(1);
  return r?.role;
}

describe('createWorkspace + platform support', () => {
  it('adds the support account as a hidden member of the new workspace', async () => {
    const support = await newUser();
    const owner = await newUser();
    process.env.LUMINA_SUPPORT_USER_IDS = support;
    const { merchantId } = await createWorkspace(ctx.db, { userId: owner, name: 'Acme' });
    expect(await roleOf(merchantId, owner)).toBe('owner');
    expect(await roleOf(merchantId, support)).toBe('support');
  });

  it('does not self-enroll when the creator is the support account', async () => {
    const support = await newUser();
    process.env.LUMINA_SUPPORT_USER_IDS = support;
    const { merchantId } = await createWorkspace(ctx.db, { userId: support, name: 'Internal' });
    // owner row only — no duplicate / second membership row for the support user
    expect(await roleOf(merchantId, support)).toBe('owner');
    const rows = await ctx.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.merchantId, merchantId), eq(memberships.userId, support)));
    expect(rows).toHaveLength(1);
  });

  it('still creates the workspace when support is misconfigured (ghost id)', async () => {
    const owner = await newUser();
    process.env.LUMINA_SUPPORT_USER_IDS = randomUUID(); // not a real auth.users row
    const { merchantId, created } = await createWorkspace(ctx.db, { userId: owner, name: 'Resilient' });
    expect(created).toBe(true);
    expect(await roleOf(merchantId, owner)).toBe('owner');
  });
});

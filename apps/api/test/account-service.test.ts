import { randomUUID } from 'node:crypto';
import { memberships, merchants } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listTeam, updateMerchantName } from '../src/lib/account/service.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Co', slug: `co-${randomUUID()}`, plan: 'growth' })
    .returning();
  return firstOrThrow(rows).id;
}

async function newUser(email: string): Promise<string> {
  const id = randomUUID();
  await ctx.db.execute(sql`insert into auth.users (id, email) values (${id}::uuid, ${email})`);
  return id;
}

describe('listTeam', () => {
  it('lists members of the merchant with their email + role', async () => {
    const m = await newMerchant();
    const owner = await newUser('owner@store.it');
    const admin = await newUser('admin@store.it');
    await ctx.db.insert(memberships).values([
      { merchantId: m, userId: owner, role: 'owner' },
      { merchantId: m, userId: admin, role: 'admin' },
    ]);

    const members = await listTeam(ctx.db, m);
    expect(members).toHaveLength(2);
    const emails = members.map((x) => x.email).sort();
    expect(emails).toEqual(['admin@store.it', 'owner@store.it']);
    expect(members.find((x) => x.email === 'owner@store.it')?.role).toBe('owner');
  });

  it('scopes strictly to the merchant', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const u = await newUser(`u-${randomUUID()}@s.it`);
    await ctx.db.insert(memberships).values({ merchantId: a, userId: u, role: 'owner' });

    expect(await listTeam(ctx.db, b)).toHaveLength(0);
  });
});

describe('updateMerchantName', () => {
  it('renames the merchant, scoped to its id', async () => {
    const m = await newMerchant();
    const ok = await updateMerchantName(ctx.db, m, 'Atelier Módena');
    expect(ok).toBe(true);

    const [row] = await ctx.db
      .select({ name: merchants.name })
      .from(merchants)
      .where(sql`${merchants.id} = ${m}::uuid`);
    expect(row?.name).toBe('Atelier Módena');
  });

  it('returns false for an unknown merchant', async () => {
    expect(await updateMerchantName(ctx.db, randomUUID(), 'Ghost')).toBe(false);
  });
});

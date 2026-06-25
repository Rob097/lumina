import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { apiKeys, memberships, widgetConfigs } from '@lumina/db';
import { setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureMerchantForUser } from '../src/lib/bootstrap.js';

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

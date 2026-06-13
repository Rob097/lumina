import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { generations, merchants, products } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  listClientsWithStats,
  updateClient,
} from '../src/lib/clients/service';
import { listGenerations } from '../src/lib/generations/service';
import {
  createGeneration,
  type GenerateDeps,
} from '../src/lib/generate/service';
import { emailGenerationResult } from '../src/lib/generations/email';
import type { EmailSender } from '../src/lib/email';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});
afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(credits = 10): Promise<string> {
  return firstOrThrow(
    await ctx.db
      .insert(merchants)
      .values({ name: 'StudioCo', slug: `st-${randomUUID()}`, creditsBalance: credits })
      .returning(),
  ).id;
}

async function newProduct(merchantId: string): Promise<string> {
  return firstOrThrow(
    await ctx.db
      .insert(products)
      .values({
        merchantId,
        name: 'Oak Console',
        category: 'furniture',
        imageUrl: 'https://shop.test/oak.png',
      })
      .returning(),
  ).id;
}

const noopDeps: GenerateDeps = {
  enqueue: async () => {},
  signResult: async (key) => `https://signed/${key}`,
};

describe('clients service', () => {
  it('creates, lists, gets, updates and deletes — all merchant-scoped', async () => {
    const merchantId = await newMerchant();

    const created = await createClient(ctx.db, merchantId, {
      name: 'Mara Rossi',
      email: 'mara@example.com',
    });
    expect(created.name).toBe('Mara Rossi');
    expect(created.merchantId).toBe(merchantId);

    const list = await listClients(ctx.db, merchantId);
    expect(list.map((c) => c.id)).toContain(created.id);

    const updated = await updateClient(ctx.db, merchantId, created.id, { phone: '+39 333' });
    expect(updated?.phone).toBe('+39 333');
    expect(updated?.email).toBe('mara@example.com'); // untouched

    expect(await deleteClient(ctx.db, merchantId, created.id)).toBe(true);
    expect(await getClient(ctx.db, merchantId, created.id)).toBeNull();
  });

  it('never leaks a client across tenants (scoped by merchant_id)', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    const client = await createClient(ctx.db, a, { name: 'A Customer' });

    expect(await getClient(ctx.db, b, client.id)).toBeNull(); // B can't read A's client
    expect((await listClients(ctx.db, b)).map((c) => c.id)).not.toContain(client.id);
    expect(await updateClient(ctx.db, b, client.id, { name: 'hijack' })).toBeNull();
    expect(await deleteClient(ctx.db, b, client.id)).toBe(false);
  });
});

describe('Studio generation (createGeneration via internal product uuid + clientId)', () => {
  it('debits one credit and links the client', async () => {
    const merchantId = await newMerchant(5);
    const productUuid = await newProduct(merchantId);
    const client = await createClient(ctx.db, merchantId, { name: 'Walk-in' });

    const result = await createGeneration(ctx.db, noopDeps, {
      merchantId,
      productUuid,
      roomKey: `rooms/${merchantId}/r.jpg`,
      clientId: client.id,
      metadata: { source: 'studio' },
    });
    expect(result.status).toBe('queued');

    const gen = firstOrThrow(
      await ctx.db.select().from(generations).where(eq(generations.id, result.generationId)),
    );
    expect(gen.clientId).toBe(client.id);
    expect(gen.productId).toBe(productUuid);
    expect(gen.productSnapshot.name).toBe('Oak Console');

    const balance = firstOrThrow(
      await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)),
    ).creditsBalance;
    expect(balance).toBe(4); // 5 - 1
  });

  it('clears client_id on the generation when the client is deleted (ON DELETE SET NULL)', async () => {
    const merchantId = await newMerchant(5);
    const productUuid = await newProduct(merchantId);
    const client = await createClient(ctx.db, merchantId, { name: 'Temp' });
    const result = await createGeneration(ctx.db, noopDeps, {
      merchantId,
      productUuid,
      roomKey: `rooms/${merchantId}/r2.jpg`,
      clientId: client.id,
    });

    await deleteClient(ctx.db, merchantId, client.id);

    const gen = firstOrThrow(
      await ctx.db.select().from(generations).where(eq(generations.id, result.generationId)),
    );
    expect(gen.clientId).toBeNull(); // generation kept on file, link nulled
  });
});

/** Insert a generation row directly, for full control over client/anon/source/time. */
async function insertGen(opts: {
  merchantId: string;
  clientId?: string | null;
  anonId?: string | null;
  source?: string;
  createdAt?: Date;
}): Promise<string> {
  return firstOrThrow(
    await ctx.db
      .insert(generations)
      .values({
        merchantId: opts.merchantId,
        roomKey: `rooms/${opts.merchantId}/${randomUUID()}.jpg`,
        productSnapshot: { name: 'Oak Console', category: 'furniture', imageUrl: 'https://x/p.png' },
        idempotencyKey: randomUUID(),
        status: 'succeeded',
        resultKey: `results/${opts.merchantId}/${randomUUID()}.jpg`,
        creditsSpent: 1,
        clientId: opts.clientId ?? null,
        anonId: opts.anonId ?? null,
        metadata: opts.source ? { source: opts.source } : {},
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      })
      .returning(),
  ).id;
}

describe('listClientsWithStats', () => {
  it('augments each client with render count + last activity, merchant-scoped', async () => {
    const merchantId = await newMerchant();
    const active = await createClient(ctx.db, merchantId, { name: 'Active' });
    const fresh = await createClient(ctx.db, merchantId, { name: 'Fresh' });

    await insertGen({ merchantId, clientId: active.id, createdAt: new Date('2026-06-01T10:00:00Z') });
    await insertGen({ merchantId, clientId: active.id, createdAt: new Date('2026-06-10T10:00:00Z') });

    // Another tenant's render linked to its own client must not be counted here.
    const other = await newMerchant();
    const otherClient = await createClient(ctx.db, other, { name: 'Other' });
    await insertGen({ merchantId: other, clientId: otherClient.id });

    const stats = await listClientsWithStats(ctx.db, merchantId);
    const byId = new Map(stats.map((c) => [c.id, c]));
    expect(byId.get(active.id)?.generationCount).toBe(2);
    expect(byId.get(active.id)?.lastGenerationAt).toBe(new Date('2026-06-10T10:00:00Z').toISOString());
    expect(byId.get(fresh.id)?.generationCount).toBe(0);
    expect(byId.get(fresh.id)?.lastGenerationAt).toBeNull();
    expect(byId.has(otherClient.id)).toBe(false);

    // Ordered by most recent activity first (Active before the never-rendered Fresh).
    expect(stats.findIndex((c) => c.id === active.id)).toBeLessThan(
      stats.findIndex((c) => c.id === fresh.id),
    );
  });
});

describe('listGenerations filters (client + source)', () => {
  it('filters to a single client and never crosses tenants', async () => {
    const merchantId = await newMerchant();
    const a = await createClient(ctx.db, merchantId, { name: 'A' });
    const b = await createClient(ctx.db, merchantId, { name: 'B' });
    const genA = await insertGen({ merchantId, clientId: a.id, source: 'studio' });
    await insertGen({ merchantId, clientId: b.id, source: 'studio' });

    const forA = await listGenerations(ctx.db, merchantId, { clientId: a.id });
    expect(forA.items.map((g) => g.id)).toEqual([genA]);
    expect(forA.items[0]?.clientId).toBe(a.id);

    // A different merchant sees nothing for A's client id.
    const other = await newMerchant();
    expect((await listGenerations(ctx.db, other, { clientId: a.id })).items).toHaveLength(0);
  });

  it('source=studio excludes widget renders (which carry an anonId)', async () => {
    const merchantId = await newMerchant();
    const studioGen = await insertGen({ merchantId, source: 'studio' });
    await insertGen({ merchantId, anonId: 'anon_widget_1' });

    const studio = await listGenerations(ctx.db, merchantId, { source: 'studio' });
    expect(studio.items.map((g) => g.id)).toEqual([studioGen]);
  });
});

describe('emailGenerationResult', () => {
  function sender(): { sent: { to: string; subject: string }[]; sender: EmailSender } {
    const sent: { to: string; subject: string }[] = [];
    return {
      sent,
      sender: {
        async send(msg) {
          sent.push({ to: msg.to, subject: msg.subject });
        },
      },
    };
  }

  async function succeededGen(merchantId: string, clientId: string | null): Promise<string> {
    return firstOrThrow(
      await ctx.db
        .insert(generations)
        .values({
          merchantId,
          roomKey: `rooms/${merchantId}/r.jpg`,
          productSnapshot: { name: 'Oak Console', category: 'furniture', imageUrl: 'https://x/p.png' },
          idempotencyKey: randomUUID(),
          status: 'succeeded',
          resultKey: `results/${merchantId}/g.jpg`,
          creditsSpent: 1,
          clientId,
        })
        .returning(),
    ).id;
  }

  it("emails the linked client's address with a signed result link", async () => {
    const merchantId = await newMerchant();
    const client = await createClient(ctx.db, merchantId, {
      name: 'Mara',
      email: 'mara@example.com',
    });
    const genId = await succeededGen(merchantId, client.id);
    const { sent, sender: s } = sender();
    const presign = vi.fn(async (key: string) => `https://signed/${key}`);

    const outcome = await emailGenerationResult(
      ctx.db,
      { presignDownload: presign, sender: s },
      { merchantId, generationId: genId },
    );
    expect(outcome).toEqual({ ok: true, email: 'mara@example.com' });
    expect(sent[0]?.to).toBe('mara@example.com');
    expect(presign).toHaveBeenCalledWith(`results/${merchantId}/g.jpg`, expect.any(Number));
  });

  it('falls back to no_recipient when neither an explicit email nor a client email exists', async () => {
    const merchantId = await newMerchant();
    const genId = await succeededGen(merchantId, null);
    const { sent, sender: s } = sender();
    const outcome = await emailGenerationResult(
      ctx.db,
      { presignDownload: async (k) => k, sender: s },
      { merchantId, generationId: genId },
    );
    expect(outcome).toEqual({ ok: false, reason: 'no_recipient' });
    expect(sent).toHaveLength(0);
  });

  it('refuses a generation that has not succeeded', async () => {
    const merchantId = await newMerchant();
    const genId = firstOrThrow(
      await ctx.db
        .insert(generations)
        .values({
          merchantId,
          roomKey: `rooms/${merchantId}/r.jpg`,
          productSnapshot: { name: 'X', category: 'furniture', imageUrl: 'https://x/p.png' },
          idempotencyKey: randomUUID(),
          status: 'queued',
          creditsSpent: 1,
        })
        .returning(),
    ).id;
    const { sender: s } = sender();
    const outcome = await emailGenerationResult(
      ctx.db,
      { presignDownload: async (k) => k, sender: s },
      { merchantId, generationId: genId, email: 'x@y.com' },
    );
    expect(outcome).toEqual({ ok: false, reason: 'not_ready' });
  });
});

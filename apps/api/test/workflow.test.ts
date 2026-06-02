import { randomUUID } from 'node:crypto';
import { AIOrchestrator, MockProvider } from '@lumina/ai';
import { eq } from 'drizzle-orm';
import { creditLedger, generationAssets, generations, merchants, usageEvents } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processGeneration, type StoragePort } from '../src/lib/inngest/workflow.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

const storage: StoragePort = {
  presignDownload: async (key) => `https://signed/${key}`,
  putObject: async () => {},
};

function orchestrator(fail = false): AIOrchestrator {
  const provider = new MockProvider({ name: 'mock', model: 'mock-compose', alwaysFail: fail });
  return new AIOrchestrator({ chains: { quality: [provider], balanced: [provider], fast: [provider] } });
}

/** Insert a queued generation and debit 1 credit, mimicking createGeneration's committed state. */
async function queued(creditsAfterDebit: number): Promise<{ merchantId: string; generationId: string }> {
  const merchantId = firstOrThrow(
    await ctx.db
      .insert(merchants)
      .values({ name: 'WfCo', slug: `wf-${randomUUID()}`, creditsBalance: creditsAfterDebit })
      .returning(),
  ).id;
  const generationId = firstOrThrow(
    await ctx.db
      .insert(generations)
      .values({
        merchantId,
        roomKey: `rooms/${merchantId}/r.jpg`,
        productSnapshot: { name: 'Aura', category: 'lighting', imageUrl: 'https://shop.test/a.png' },
        idempotencyKey: randomUUID(),
        status: 'queued',
        creditsSpent: 1,
      })
      .returning(),
  ).id;
  // the debit's ledger row (so refund math is verifiable)
  await ctx.db.insert(creditLedger).values({ merchantId, amount: -1, reason: 'generation', generationId });
  return { merchantId, generationId };
}

describe('processGeneration', () => {
  it('composes, stores, and finalizes a success (no refund)', async () => {
    const { merchantId, generationId } = await queued(4);
    const outcome = await processGeneration({ db: ctx.db, orchestrator: orchestrator(), storage }, generationId);
    expect(outcome).toBe('succeeded');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.status).toBe('succeeded');
    expect(gen.resultKey).toBe(`results/${merchantId}/${generationId}.jpg`);
    expect(gen.model).toBe('mock-compose');
    expect(gen.finishedAt).not.toBeNull();

    const assets = await ctx.db.select().from(generationAssets).where(eq(generationAssets.generationId, generationId));
    expect(assets.map((a) => a.role)).toContain('result');
    const events = await ctx.db.select().from(usageEvents).where(eq(usageEvents.generationId, generationId));
    expect(events.map((e) => e.type)).toContain('success');

    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(4); // unchanged — paid generation
  });

  it('refunds the credit and marks failed when all providers fail', async () => {
    const { merchantId, generationId } = await queued(4);
    const outcome = await processGeneration({ db: ctx.db, orchestrator: orchestrator(true), storage }, generationId);
    expect(outcome).toBe('failed');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.status).toBe('failed');
    expect(gen.errorCode).toBe('generation_failed');

    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(5); // refunded (+1)

    const sum =
      await ctx.sqlClient`select coalesce(sum(amount),0)::int as s from credit_ledger where merchant_id = ${merchantId}::uuid`;
    expect(sum[0]?.s).toBe(0); // -1 debit + 1 refund
  });

  it('skips a generation that is already finished', async () => {
    const { generationId } = await queued(4);
    await ctx.db.update(generations).set({ status: 'succeeded' }).where(eq(generations.id, generationId));
    expect(
      await processGeneration({ db: ctx.db, orchestrator: orchestrator(), storage }, generationId),
    ).toBe('skipped');
  });
});

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  AIOrchestrator,
  MockProvider,
  MockQuantityProvider,
  type AIProvider,
  type ModerationProvider,
  type QuantityProvider,
} from '@lumina/ai';
import { eq } from 'drizzle-orm';
import {
  creditLedger,
  generationAssets,
  generations,
  merchants,
  usageEvents,
  type ProductSnapshot,
} from '@lumina/db';
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

/** A clean minimal JPEG (no metadata → strip is a no-op). */
const CLEAN_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x01, 0x10, 0xff, 0xd9]);

const storage: StoragePort = {
  getObject: async () => CLEAN_JPEG,
  presignDownload: async (key) => `https://signed/${key}`,
  putObject: async () => {},
};

const ASCII = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
function contains(hay: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function orchestrator(fail = false, quantity?: QuantityProvider): AIOrchestrator {
  const provider = new MockProvider({ name: 'mock', model: 'mock-compose', alwaysFail: fail });
  return new AIOrchestrator({
    chains: { quality: [provider], balanced: [provider], fast: [provider] },
    ...(quantity ? { quantity } : {}),
  });
}

/** Insert a queued generation and debit 1 credit, mimicking createGeneration's committed state. */
async function queued(
  creditsAfterDebit: number,
  snapshot: Partial<ProductSnapshot> = {},
): Promise<{ merchantId: string; generationId: string }> {
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
        productSnapshot: {
          name: 'Aura',
          category: 'lighting',
          imageUrl: 'https://shop.test/a.png',
          ...snapshot,
        },
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

  it('keeps original pixels outside the product change (pixel-perfect composite)', async () => {
    const solid = async (rgb: { r: number; g: number; b: number }, w = 100, h = 100): Promise<Uint8Array> =>
      new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer());

    const room = await solid({ r: 255, g: 0, b: 0 }); // red room photo
    const blue = await solid({ r: 0, g: 0, b: 255 }, 50, 50);
    const edited = new Uint8Array(
      await sharp(Buffer.from(room)).composite([{ input: Buffer.from(blue), left: 25, top: 25 }]).png().toBuffer(),
    ); // the model's render: a blue "product" in the centre, everything else re-rendered

    let stored: Uint8Array | null = null;
    const realStorage: StoragePort = {
      getObject: async () => room,
      presignDownload: async (k) => `https://signed/${k}`,
      putObject: async (k, body) => {
        if (k.includes('results/')) stored = body;
      },
    };
    const editedProvider: AIProvider = {
      name: 'edited',
      compose: async () => ({ bytes: edited, contentType: 'image/png', model: 'mock', costCents: 1, width: 100, height: 100 }),
    };
    const orch = new AIOrchestrator({
      chains: { quality: [editedProvider], balanced: [editedProvider], fast: [editedProvider] },
      quantity: new MockQuantityProvider(),
    });

    const { generationId } = await queued(4);
    const outcome = await processGeneration({ db: ctx.db, orchestrator: orch, storage: realStorage }, generationId);
    expect(outcome).toBe('succeeded');
    expect(stored).not.toBeNull();

    const { data, info } = await sharp(Buffer.from(stored!)).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number): [number, number, number] => {
      const i = (y * info.width + x) * info.channels;
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
    };
    expect(px(3, 3)).toEqual([255, 0, 0]); // corner = exactly the original room (preserved)
    expect(px(50, 50)).toEqual([0, 0, 255]); // centre = the product change kept
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

  it('rejects a non-environment input, refunds, and never composes', async () => {
    const { merchantId, generationId } = await queued(4);
    const rejectInput: ModerationProvider = {
      moderateInput: async () => ({ ok: false, reason: 'not_environment' }),
      moderateOutput: async () => ({ ok: true }),
    };
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestrator(), storage, moderation: rejectInput },
      generationId,
    );
    expect(outcome).toBe('failed');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.status).toBe('failed');
    expect(gen.errorCode).toBe('not_environment');
    expect(gen.resultKey).toBeNull();

    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(5); // refunded
  });

  it('blocks an unsafe output and refunds', async () => {
    const { merchantId, generationId } = await queued(4);
    const rejectOutput: ModerationProvider = {
      moderateInput: async () => ({ ok: true }),
      moderateOutput: async () => ({ ok: false, reason: 'unsafe' }),
    };
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestrator(), storage, moderation: rejectOutput },
      generationId,
    );
    expect(outcome).toBe('failed');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.status).toBe('failed');
    expect(gen.errorCode).toBe('unsafe_output');

    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(5); // refunded
  });

  it('strips EXIF from the room on ingest before composing', async () => {
    const { generationId } = await queued(4);
    const exifJpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0c, ...ASCII('Exif'), 0x00, 0x00, 0x2a, 0x2a, 0x2a, 0x2a,
      0xff, 0xda, 0x00, 0x03, 0x01, 0xaa, 0xff, 0xd9,
    ]);
    const stored: { key: string; body: Uint8Array }[] = [];
    const spyStorage: StoragePort = {
      getObject: async () => exifJpeg,
      presignDownload: async (key) => `https://signed/${key}`,
      putObject: async (key, body) => {
        stored.push({ key, body });
      },
    };

    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestrator(), storage: spyStorage },
      generationId,
    );
    expect(outcome).toBe('succeeded');

    const room = stored.find((s) => s.key.startsWith('rooms/'));
    expect(room).toBeTruthy();
    expect(contains(room!.body, ASCII('Exif'))).toBe(false); // re-stored without EXIF
  });

  it('skips a generation that is already finished', async () => {
    const { generationId } = await queued(4);
    await ctx.db.update(generations).set({ status: 'succeeded' }).where(eq(generations.id, generationId));
    expect(
      await processGeneration({ db: ctx.db, orchestrator: orchestrator(), storage }, generationId),
    ).toBe('skipped');
  });

  it('persists a confident coverage quantity estimate (#7)', async () => {
    const { generationId } = await queued(4, {
      category: 'tiles',
      dimensions: { w: 30, h: 30, unit: 'cm' },
    });
    const quantity = new MockQuantityProvider({
      suggestedQuantity: 9,
      unit: 'tiles',
      rationale: 'About 9 tiles to cover the floor.',
      confidence: 0.8,
    });
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestrator(false, quantity), storage },
      generationId,
    );
    expect(outcome).toBe('succeeded');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.suggestedQuantity).toBe(9);
    expect(gen.quantityRationale).toContain('floor');
    expect(quantity.callCount).toBe(1);
  });

  it('leaves the quantity null for single-unit products (no estimate call)', async () => {
    const { generationId } = await queued(4, { category: 'furniture' });
    const quantity = new MockQuantityProvider();
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestrator(false, quantity), storage },
      generationId,
    );
    expect(outcome).toBe('succeeded');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.suggestedQuantity).toBeNull();
    expect(quantity.callCount).toBe(0); // orchestrator short-circuits single-unit before the provider
  });

  it('drops a low-confidence coverage estimate but still succeeds', async () => {
    const { generationId } = await queued(4, { category: 'tiles' });
    const quantity = new MockQuantityProvider({ suggestedQuantity: 9, confidence: 0.2 });
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestrator(false, quantity), storage },
      generationId,
    );
    expect(outcome).toBe('succeeded');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.suggestedQuantity).toBeNull();
  });

  it('never fails the generation when the estimate throws', async () => {
    const { generationId } = await queued(4, { category: 'tiles' });
    const throwing: QuantityProvider = {
      name: 'boom',
      estimateQuantity: async () => {
        throw new Error('vision down');
      },
    };
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestrator(false, throwing), storage },
      generationId,
    );
    expect(outcome).toBe('succeeded');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.suggestedQuantity).toBeNull();
  });
});

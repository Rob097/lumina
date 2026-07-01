import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  AIOrchestrator,
  MockProvider,
  MockQuantityProvider,
  type AIProvider,
  type ImageRef,
  type ModerationProvider,
  type QuantityProvider,
  type SceneAnalysis,
} from '@lumina/ai';
import { neutralGenerationPlan, type GenerationMode, type GenerationPlan } from '@lumina/shared';
import { eq } from 'drizzle-orm';
import {
  creditLedger,
  generationAssets,
  generations,
  merchants,
  products,
  usageEvents,
  type ProductSnapshot,
} from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { markFailed, processGeneration, type StoragePort } from '../src/lib/inngest/workflow.js';

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

// Product background removal (Phase 1 / D63): the workflow gives the compositor a clean cutout instead of
// a busy product photo, computed once per product and cached on products.clean_image_key.
describe('processGeneration — product cutout', () => {
  /** Insert a queued generation for a specific catalog product (+ its debit ledger row). */
  async function queuedForProduct(merchantId: string, productId: string): Promise<string> {
    const id = firstOrThrow(
      await ctx.db
        .insert(generations)
        .values({
          merchantId,
          productId,
          roomKey: `rooms/${merchantId}/${randomUUID()}.jpg`,
          productSnapshot: { name: 'Aura', category: 'lighting', imageUrl: 'https://shop.test/aura.png' },
          idempotencyKey: randomUUID(),
          status: 'queued',
          creditsSpent: 1,
        })
        .returning(),
    ).id;
    await ctx.db.insert(creditLedger).values({ merchantId, amount: -1, reason: 'generation', generationId: id });
    return id;
  }

  function orchestratorWithBgRemoval(removeBackground: () => Promise<{ bytes: Uint8Array; contentType: string }>) {
    const provider = new MockProvider({ name: 'mock', model: 'mock-compose' });
    return new AIOrchestrator({
      chains: { quality: [provider], balanced: [provider], fast: [provider] },
      bgRemoval: { removeBackground },
      quantity: new MockQuantityProvider(),
    });
  }

  it('computes a product cutout, caches it on the product, and reuses it on the next generation', async () => {
    const merchantId = firstOrThrow(
      await ctx.db.insert(merchants).values({ name: 'CutCo', slug: `cut-${randomUUID()}`, creditsBalance: 10 }).returning(),
    ).id;
    const productId = firstOrThrow(
      await ctx.db
        .insert(products)
        .values({ merchantId, name: 'Aura', category: 'lighting', imageUrl: 'https://shop.test/aura.png' })
        .returning(),
    ).id;

    const removeBackground = vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }));
    const orch = orchestratorWithBgRemoval(removeBackground);

    const puts: string[] = [];
    const recStorage: StoragePort = {
      getObject: async () => CLEAN_JPEG,
      presignDownload: async (k) => `https://signed/${k}`,
      putObject: async (k) => {
        puts.push(k);
      },
    };

    const gen1 = await queuedForProduct(merchantId, productId);
    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage: recStorage }, gen1)).toBe('succeeded');
    expect(removeBackground).toHaveBeenCalledTimes(1);

    const cleanKey = firstOrThrow(await ctx.db.select().from(products).where(eq(products.id, productId))).cleanImageKey;
    expect(cleanKey).toMatch(new RegExp(`^products/${merchantId}/clean/`));
    expect(puts.some((k) => k.startsWith(`products/${merchantId}/clean/`))).toBe(true);

    const gen2 = await queuedForProduct(merchantId, productId);
    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage: recStorage }, gen2)).toBe('succeeded');
    expect(removeBackground).toHaveBeenCalledTimes(1); // reused the cache — no second removal call
  });

  it('degrades to a successful generation when bg removal throws (never bills a cutout failure)', async () => {
    const merchantId = firstOrThrow(
      await ctx.db.insert(merchants).values({ name: 'CutCo2', slug: `cut-${randomUUID()}`, creditsBalance: 10 }).returning(),
    ).id;
    const productId = firstOrThrow(
      await ctx.db
        .insert(products)
        .values({ merchantId, name: 'Aura', category: 'lighting', imageUrl: 'https://shop.test/aura.png' })
        .returning(),
    ).id;
    const orch = orchestratorWithBgRemoval(async () => {
      throw new Error('matting down');
    });
    const gen = await queuedForProduct(merchantId, productId);
    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage }, gen)).toBe('succeeded');
    // No cutout cached when removal failed.
    expect(firstOrThrow(await ctx.db.select().from(products).where(eq(products.id, productId))).cleanImageKey).toBeNull();
  });
});

describe('processGeneration — planner (Phase 1)', () => {
  const plan: GenerationPlan = {
    mode: 'surface_covering',
    target: { description: 'the back wall', bbox: [0, 0.1, 1, 0.9] },
    repetition: { kind: 'grid', estimatedCount: 8 },
    scale: { productDimensionsCm: { w: 60, h: 60 } },
    sceneFacts: {
      isExterior: false,
      lighting: { direction: 'top-left', intensity: 'medium' },
      surfaces: [{ kind: 'wall' }],
      tiltDegrees: 0,
      quality: { blurry: false, dark: false, cluttered: false },
    },
    productAnalysis: 'a slatted acoustic wood wall panel',
    confidence: 0.8,
  };

  /** An orchestrator whose compose records the scene facts + product description it received. */
  function orchestratorCapturingScene(
    planFn: () => Promise<GenerationPlan>,
    captured: { scene?: SceneAnalysis; productDescription?: string },
  ): AIOrchestrator {
    const provider: AIProvider = {
      name: 'capture',
      compose: async (input) => {
        captured.scene = input.scene;
        captured.productDescription = input.productDescription;
        return { bytes: new Uint8Array([1]), contentType: 'image/png', model: 'mock-compose', costCents: 1, width: 100, height: 100 };
      },
    };
    return new AIOrchestrator({
      chains: { quality: [provider], balanced: [provider], fast: [provider] },
      planner: { plan: planFn },
    });
  }

  it('runs the planner and feeds its per-image facts into compose', async () => {
    const { generationId } = await queued(5);
    const planFn = vi.fn(async () => plan);
    const captured: { scene?: SceneAnalysis; productDescription?: string } = {};
    const orch = orchestratorCapturingScene(planFn, captured);

    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage }, generationId)).toBe('succeeded');
    expect(planFn).toHaveBeenCalledTimes(1);
    expect(captured.scene?.lighting.direction).toBe('top-left');
    expect(captured.scene?.suggestedPlacement?.region).toBe('the back wall');
    expect(captured.scene?.confidence).toBe(0.8);
    // The planner's product analysis flows into compose as the identity anchor.
    expect(captured.productDescription).toBe('a slatted acoustic wood wall panel');
  });

  it('degrades to a successful generation when the planner throws (best-effort neutral plan)', async () => {
    const { generationId } = await queued(5);
    const captured: { scene?: SceneAnalysis; productDescription?: string } = {};
    const orch = orchestratorCapturingScene(async () => {
      throw new Error('planner down');
    }, captured);

    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage }, generationId)).toBe('succeeded');
    expect(captured.scene?.confidence).toBe(0); // neutral object_placement fallback
  });
});

describe('processGeneration — tiles (force floor + flash)', () => {
  // A planner read that, for any other category, would mis-classify a tile as a single object placed on a
  // wall AND escalate to the slow quality tier (cluttered scene + low confidence). Tiles must ignore all of
  // that: cover the FLOOR and stay on the fast tier.
  const wallPlanLowConf: GenerationPlan = {
    mode: 'object_placement',
    target: { description: 'the back wall', bbox: [0, 0, 1, 1] },
    repetition: { kind: 'single' },
    scale: {},
    sceneFacts: {
      isExterior: false,
      lighting: { direction: 'top', intensity: 'medium' },
      surfaces: [{ kind: 'wall' }],
      tiltDegrees: 0,
      quality: { blurry: false, dark: false, cluttered: true },
    },
    productAnalysis: 'a ceramic floor tile',
    confidence: 0.2,
  };

  /** An orchestrator whose compose records the routing decision (mode / target / policy) it received. */
  function orchestratorCapturingRoute(
    planFn: () => Promise<GenerationPlan>,
    captured: { mode?: GenerationMode; target?: { description?: string }; policy?: string },
  ): AIOrchestrator {
    const provider: AIProvider = {
      name: 'capture',
      compose: async (input) => {
        captured.mode = input.mode;
        captured.target = input.target;
        captured.policy = input.policy;
        return { bytes: new Uint8Array([1]), contentType: 'image/png', model: 'mock-compose', costCents: 1, width: 100, height: 100 };
      },
    };
    return new AIOrchestrator({
      chains: { quality: [provider], balanced: [provider], fast: [provider] },
      planner: { plan: planFn },
    });
  }

  it('forces surface_covering on the floor and the fast tier for a Tiles product', async () => {
    const { generationId } = await queued(5, {
      category: 'tiles',
      name: 'Terra',
      imageUrl: 'https://shop.test/tile.png',
    });
    const captured: { mode?: GenerationMode; target?: { description?: string }; policy?: string } = {};
    const orch = orchestratorCapturingRoute(async () => wallPlanLowConf, captured);

    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage }, generationId)).toBe('succeeded');
    // Forced onto the floor as a repeating surface — the planner's wall/object read is overridden.
    expect(captured.mode).toBe('surface_covering');
    expect(captured.target?.description).toBe('the floor');
    // Pinned to the fast/flash tier, even though the cluttered + low-confidence plan would escalate to quality.
    expect(captured.policy).toBe('fast');
  });
});

describe('processGeneration — room normalization (Phase 3)', () => {
  async function realJpeg(w: number, h: number): Promise<Uint8Array> {
    return new Uint8Array(
      await sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 120, b: 120 } } }).jpeg().toBuffer(),
    );
  }

  /** An orchestrator whose planner reports a fixed tilt (so normalization is driven deterministically). */
  function orchestratorWithTilt(tiltDegrees: number): AIOrchestrator {
    const provider = new MockProvider({ name: 'mock', model: 'mock-compose' });
    const plan: GenerationPlan = {
      mode: 'object_placement',
      target: { description: 'the corner' },
      repetition: { kind: 'single' },
      scale: {},
      sceneFacts: {
        isExterior: false,
        lighting: { direction: 'top-left', intensity: 'medium' },
        surfaces: [],
        tiltDegrees,
        quality: { blurry: false, dark: false, cluttered: false },
      },
      confidence: 0.8,
    };
    return new AIOrchestrator({
      chains: { quality: [provider], balanced: [provider], fast: [provider] },
      planner: { plan: async () => plan },
    });
  }

  function recordingStorage(room: Uint8Array, puts: { key: string; bytes: Uint8Array }[]): StoragePort {
    return {
      getObject: async () => room,
      presignDownload: async (k) => `https://signed/${k}`,
      putObject: async (k, b) => {
        puts.push({ key: k, bytes: b });
      },
    };
  }

  it('deskews a tilted room and stores the straightened (smaller) room back', async () => {
    const { generationId } = await queued(5);
    const puts: { key: string; bytes: Uint8Array }[] = [];
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestratorWithTilt(6), storage: recordingStorage(await realJpeg(400, 300), puts) },
      generationId,
    );
    expect(outcome).toBe('succeeded');
    const roomWrite = puts.filter((p) => p.key.startsWith('rooms/')).at(-1);
    expect(roomWrite).toBeDefined();
    const dims = await sharp(Buffer.from(roomWrite!.bytes)).metadata();
    expect(dims.width).toBeLessThan(400); // inscribed-rect crop removed the rotation wedges
    expect(dims.height).toBeLessThan(300);
  });

  it('leaves a level room at its original dimensions (tilt-driven, no needless crop)', async () => {
    const { generationId } = await queued(5);
    const puts: { key: string; bytes: Uint8Array }[] = [];
    const outcome = await processGeneration(
      { db: ctx.db, orchestrator: orchestratorWithTilt(0), storage: recordingStorage(await realJpeg(400, 300), puts) },
      generationId,
    );
    expect(outcome).toBe('succeeded');
    const roomWrite = puts.filter((p) => p.key.startsWith('rooms/')).at(-1);
    if (roomWrite) {
      const dims = await sharp(Buffer.from(roomWrite.bytes)).metadata();
      expect(dims.width).toBe(400);
      expect(dims.height).toBe(300);
    }
  });
});

// Mode-specific compose (Phase 2): the workflow assembles a mode-specific task from the plan. A
// surface_covering product passes the ORIGINAL product texture (no cutout, §4.3) and accepts the model's
// full render (the target surface changes by design, §4.4); the coverage QUANTITY is still stored (D67).
describe('processGeneration — mode-specific surface_covering (Phase 2)', () => {
  const coveringPlan: GenerationPlan = {
    mode: 'surface_covering',
    target: { description: 'the wall behind the bed' },
    repetition: { kind: 'grid', estimatedCount: 8 },
    scale: { productDimensionsCm: { w: 60, h: 60 } },
    sceneFacts: {
      isExterior: false,
      lighting: { direction: 'top-left', intensity: 'medium' },
      surfaces: [{ kind: 'wall' }],
      tiltDegrees: 0,
      quality: { blurry: false, dark: false, cluttered: false },
    },
    confidence: 0.85,
  };

  it('passes mode to compose, skips the cutout (original texture), and keeps the full render', async () => {
    const render = new Uint8Array(
      await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer(),
    );
    const room = new Uint8Array(
      await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 200, b: 200 } } }).jpeg().toBuffer(),
    );
    const captured: { mode?: string; product?: ImageRef } = {};
    const removeBackground = vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: 'image/png' }));
    let stored: Uint8Array | null = null;
    const storageReal: StoragePort = {
      getObject: async () => room,
      presignDownload: async (k) => `https://signed/${k}`,
      putObject: async (k, b) => {
        if (k.includes('results/')) stored = b;
      },
    };
    const provider: AIProvider = {
      name: 'cap',
      compose: async (input) => {
        captured.mode = input.mode;
        captured.product = input.product;
        return { bytes: render, contentType: 'image/png', model: 'mock-compose', costCents: 1, width: 400, height: 300 };
      },
    };
    const quantity = new MockQuantityProvider({ suggestedQuantity: 7, unit: 'panels', rationale: '~7 panels to cover the wall', confidence: 0.85 });
    const orch = new AIOrchestrator({
      chains: { quality: [provider], balanced: [provider], fast: [provider] },
      planner: { plan: async () => coveringPlan },
      bgRemoval: { removeBackground },
      quantity,
    });

    const { generationId } = await queued(4, {
      category: 'decor',
      imageUrl: 'https://shop.test/panel.png',
      dimensions: { w: 60, h: 60, unit: 'cm' },
    });
    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage: storageReal }, generationId)).toBe('succeeded');

    expect(captured.mode).toBe('surface_covering');
    expect(captured.product).toEqual({ url: 'https://shop.test/panel.png' }); // original texture, NOT a cutout
    expect(removeBackground).not.toHaveBeenCalled(); // surface_covering never cuts out
    expect(stored).not.toBeNull();
    expect(new Uint8Array(stored!)).toEqual(render); // full render accepted (no localized diff composite)

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.suggestedQuantity).toBe(7); // coverage quantity still computed + stored
  });
});

// Multi-product (F2): a generation carrying productSnapshots[] composes ONE image from several products.
// Each product gets its own cutout; all are sent to compose with per-product info; the operation is forced
// to object placement; exactly one credit was debited (at creation) and no extra credit is charged here.
describe('processGeneration — multi-product (F2)', () => {
  it('sends every product image + per-product info to compose, one cutout each, forced object placement', async () => {
    // enterprise plan would resolve to the QUALITY tier for a single product — so a 'fast' policy here proves
    // the multi-product override (not just the free-tier default).
    const merchantId = firstOrThrow(
      await ctx.db
        .insert(merchants)
        .values({ name: 'Multi', slug: `m-${randomUUID()}`, creditsBalance: 4, plan: 'enterprise' })
        .returning(),
    ).id;
    const [lamp, sofa] = await ctx.db
      .insert(products)
      .values([
        { merchantId, name: 'Lamp', category: 'lighting', imageUrl: 'https://shop.test/lamp.png' },
        { merchantId, name: 'Sofa', category: 'furniture', imageUrl: 'https://shop.test/sofa.png' },
      ])
      .returning();
    const snapshots: ProductSnapshot[] = [
      { id: lamp!.id, name: 'Lamp', category: 'lighting', imageUrl: 'https://shop.test/lamp.png' },
      { id: sofa!.id, name: 'Sofa', category: 'furniture', imageUrl: 'https://shop.test/sofa.png' },
    ];
    const generationId = firstOrThrow(
      await ctx.db
        .insert(generations)
        .values({
          merchantId,
          productId: lamp!.id,
          roomKey: `rooms/${merchantId}/${randomUUID()}.jpg`,
          productSnapshot: snapshots[0]!,
          productSnapshots: snapshots,
          idempotencyKey: randomUUID(),
          status: 'queued',
          creditsSpent: 1,
        })
        .returning(),
    ).id;
    await ctx.db.insert(creditLedger).values({ merchantId, amount: -1, reason: 'generation', generationId });

    const captured: { products?: ImageRef[]; productInfos?: { name: string }[]; mode?: string; policy?: string } = {};
    const provider: AIProvider = {
      name: 'cap',
      compose: async (input) => {
        captured.products = input.products;
        captured.productInfos = input.productInfos;
        captured.mode = input.mode;
        captured.policy = input.policy;
        return { bytes: new Uint8Array([1]), contentType: 'image/png', model: 'mock-compose', costCents: 1, width: 100, height: 100 };
      },
    };
    const removeBackground = vi.fn(async () => ({ bytes: new Uint8Array([2]), contentType: 'image/png' }));
    const orch = new AIOrchestrator({
      chains: { quality: [provider], balanced: [provider], fast: [provider] },
      bgRemoval: { removeBackground },
      quantity: new MockQuantityProvider(),
    });

    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage }, generationId)).toBe('succeeded');

    expect(captured.products).toHaveLength(2);
    expect(captured.productInfos?.map((p) => p.name)).toEqual(['Lamp', 'Sofa']);
    expect(captured.mode).toBe('object_placement');
    // Multi-product always routes to the fast tier: the quality model takes 69–133s on a multi set (>1 min
    // hard limit) with no visible quality gain over fast (~18s). See D86.
    expect(captured.policy).toBe('fast');
    expect(removeBackground).toHaveBeenCalledTimes(2); // one cutout per product

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.status).toBe('succeeded');
    expect(gen.suggestedQuantity).toBeNull(); // coverage estimate skipped for multi-product
    // Each product's cutout was cached back on its catalog row.
    expect(firstOrThrow(await ctx.db.select().from(products).where(eq(products.id, sofa!.id))).cleanImageKey).toMatch(
      new RegExp(`^products/${merchantId}/clean/`),
    );

    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(4); // unchanged — one credit, charged at creation
  });
});

// Fashion / person path (Relievum): a `fashion` category isolates the wearable-on-a-person behaviour. The
// (furniture-oriented) planner and the coverage estimate are skipped, the operation is forced to
// accessory_placement, and routing defaults to the fast tier (the face comes from the original pixels via
// the pixel-perfect composite). The furniture path is untouched (its own tests above still pass).
describe('processGeneration — fashion accessory placement (person path)', () => {
  it('skips the planner + coverage, forces accessory_placement, and routes to the fast tier', async () => {
    const { generationId } = await queued(5, {
      name: 'Borsa Diana',
      category: 'fashion',
      imageUrl: 'https://shop.test/bag.png',
    });
    const planFn = vi.fn(async () => neutralGenerationPlan());
    const quantity = new MockQuantityProvider();
    const captured: { mode?: string; policy?: string } = {};
    const provider: AIProvider = {
      name: 'cap',
      compose: async (input) => {
        captured.mode = input.mode;
        captured.policy = input.policy;
        return { bytes: new Uint8Array([1]), contentType: 'image/png', model: 'mock-compose', costCents: 1, width: 100, height: 100 };
      },
    };
    const orch = new AIOrchestrator({
      chains: { quality: [provider], balanced: [provider], fast: [provider] },
      planner: { plan: planFn },
      quantity,
    });

    expect(await processGeneration({ db: ctx.db, orchestrator: orch, storage }, generationId)).toBe('succeeded');
    expect(captured.mode).toBe('accessory_placement');
    expect(captured.policy).toBe('fast');
    expect(planFn).not.toHaveBeenCalled(); // the furniture planner is skipped for the person path
    expect(quantity.callCount).toBe(0); // coverage is furniture-only
  });
});

// The Inngest `onFailure` net: when a run dies *outside* processGeneration's own try/catch (a module-load
// crash, OOM, or timeout — the failure mode that left a generation stuck in QUEUED), this marks it failed
// and refunds the credit. It must be idempotent so retries / a late onFailure can never double-refund.
describe('markFailed (Inngest onFailure net)', () => {
  it('marks a stuck queued generation failed and refunds the credit', async () => {
    const { merchantId, generationId } = await queued(4);
    const outcome = await markFailed({ db: ctx.db }, generationId, 'generation_failed');
    expect(outcome).toBe('failed');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.status).toBe('failed');
    expect(gen.errorCode).toBe('generation_failed');
    expect(gen.finishedAt).not.toBeNull();

    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(5); // refunded (+1)
  });

  it('is idempotent — a second call neither re-fails nor double-refunds', async () => {
    const { merchantId, generationId } = await queued(4);
    expect(await markFailed({ db: ctx.db }, generationId, 'generation_failed')).toBe('failed');
    expect(await markFailed({ db: ctx.db }, generationId, 'generation_failed')).toBe('skipped');

    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(5); // still just one refund, not two

    const sum =
      await ctx.sqlClient`select coalesce(sum(amount),0)::int as s from credit_ledger where merchant_id = ${merchantId}::uuid`;
    expect(sum[0]?.s).toBe(0); // -1 debit + exactly one +1 refund
  });

  it('never refunds or overwrites a generation that already succeeded', async () => {
    const { merchantId, generationId } = await queued(4);
    await ctx.db.update(generations).set({ status: 'succeeded' }).where(eq(generations.id, generationId));

    expect(await markFailed({ db: ctx.db }, generationId, 'generation_failed')).toBe('skipped');

    const gen = firstOrThrow(await ctx.db.select().from(generations).where(eq(generations.id, generationId)));
    expect(gen.status).toBe('succeeded'); // untouched
    const balance = firstOrThrow(await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))
      .creditsBalance;
    expect(balance).toBe(4); // no refund
  });

  it('skips a generation that no longer exists', async () => {
    expect(await markFailed({ db: ctx.db }, randomUUID(), 'generation_failed')).toBe('skipped');
  });
});

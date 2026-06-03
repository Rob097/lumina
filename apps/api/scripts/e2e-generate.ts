/**
 * e2e-generate — exercises the full server-side generation path offline (no live fal/R2/Inngest):
 * seed merchant → createGeneration (debit + queue) → processGeneration (mock compose + store + finalize)
 * → assert a result + 1 credit debited → identical re-request returns the cached result for 0 credits.
 *
 * Run: `pnpm -F @lumina/api e2e` (Docker required — uses the Testcontainers harness + the mock provider).
 */
import { createOrchestratorFromEnv } from '@lumina/ai';
import { eq } from 'drizzle-orm';
import { generations, merchants } from '@lumina/db';
import { setupTestDb } from '@lumina/db/testing';
import {
  createGeneration,
  type GenerateDeps,
  type GenerationEvent,
} from '../src/lib/generate/service.js';
import { processGeneration, type StoragePort } from '../src/lib/inngest/workflow.js';

process.env.AI_PROVIDER = 'mock';
process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(`assertion failed: ${message}`);
  }
}

async function main(): Promise<void> {
  const ctx = await setupTestDb();
  try {
    const merchantId = (
      await ctx.db
        .insert(merchants)
        .values({
          name: 'E2E',
          slug: `e2e-${Date.now()}`,
          creditsBalance: 10,
          allowedDomains: ['localhost'],
        })
        .returning()
    )[0]!.id;

    const objects = new Map<string, Uint8Array>();
    const storage: StoragePort = {
      presignDownload: async (key) => `https://signed.example/${key}`,
      putObject: async (key, body) => {
        objects.set(key, body);
      },
    };
    const events: GenerationEvent[] = [];
    const deps: GenerateDeps = {
      enqueue: async (event) => {
        events.push(event);
      },
      signResult: async (key) => `https://signed.example/${key}`,
    };

    const roomKey = `rooms/${merchantId}/room.jpg`;
    objects.set(roomKey, new Uint8Array([1, 2, 3])); // simulate the uploaded room photo

    const product = { name: 'Aura', imageUrl: 'https://shop.demo/aura.png', category: 'lighting' as const };
    const input = { merchantId, inlineProduct: product, roomKey, placementHint: 'on the desk' };

    // 1) POST generate
    const g1 = await createGeneration(ctx.db, deps, input);
    console.log('generate →', g1);
    assert(g1.status === 'queued' && !g1.cached, 'first generate is queued');
    assert(events.length === 1, 'workflow enqueued once');

    // 2) Run the durable workflow (mock compose)
    const orchestrator = createOrchestratorFromEnv(process.env);
    const outcome = await processGeneration({ db: ctx.db, orchestrator, storage }, g1.generationId);
    console.log('workflow →', outcome);
    assert(outcome === 'succeeded', 'workflow succeeded');

    const gen = (await ctx.db.select().from(generations).where(eq(generations.id, g1.generationId)))[0]!;
    console.log('result url →', `https://signed.example/${gen.resultKey}`);
    assert(gen.status === 'succeeded' && gen.resultKey != null, 'generation has a result');
    assert(objects.has(gen.resultKey!), 'result bytes stored');

    const balance = (await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))[0]!
      .creditsBalance;
    console.log('balance →', balance, '(started 10, expect 9)');
    assert(balance === 9, 'one credit debited');

    // 3) Identical re-request → cached, 0 credits
    const g2 = await createGeneration(ctx.db, deps, input);
    console.log('cached →', g2);
    assert(g2.cached && g2.status === 'succeeded' && g2.resultUrl != null, 'identical request is cached');
    assert(events.length === 1, 'cache hit did not re-enqueue');

    const balance2 = (await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)))[0]!
      .creditsBalance;
    console.log('balance after cache →', balance2, '(expect 9, unchanged)');
    assert(balance2 === 9, 'cache hit cost 0 credits');

    console.log('\n✓ e2e-generate passed');
  } finally {
    await ctx.teardown();
  }
}

main().catch((err: unknown) => {
  console.error('\n✗ e2e-generate failed');
  console.error(err);
  process.exit(1);
});

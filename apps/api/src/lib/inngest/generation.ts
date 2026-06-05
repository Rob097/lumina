import { createOrchestratorFromEnv } from '@lumina/ai';
import { getDb } from '@/lib/db';
import { createR2FromEnv } from '@/lib/storage/r2';
import { createEventSink, reportError } from '@/lib/observability';
import { inngest } from './client.js';
import { processGeneration } from './workflow.js';

/**
 * Durable `generation.requested` workflow. Per-merchant + global concurrency caps protect provider rate
 * limits and our budget; `processGeneration` handles compose → store → finalize and refunds the credit
 * on terminal failure (so a failed job is never billed).
 */
export const generationRequested = inngest.createFunction(
  {
    id: 'generation-requested',
    retries: 2,
    concurrency: [
      { limit: Number(process.env.GLOBAL_CONCURRENCY ?? 20) },
      { key: 'event.data.merchantId', limit: Number(process.env.MERCHANT_CONCURRENCY ?? 3) },
    ],
  },
  { event: 'generation.requested' },
  async ({ event, step }) => {
    return step.run('process-generation', async () => {
      const storage = createR2FromEnv(process.env);
      if (!storage) {
        throw new Error('R2 is not configured');
      }
      const orchestrator = createOrchestratorFromEnv(process.env);
      return processGeneration(
        { db: getDb(), orchestrator, storage, events: createEventSink(process.env), reportError },
        event.data.generationId,
      );
    });
  },
);

import { createOrchestratorFromEnv } from '@lumina/ai';
import { getDb } from '@/lib/db';
import { createR2FromEnv } from '@/lib/storage/r2';
import { createEventSink, reportError } from '@/lib/observability';
import { emailSenderFromEnv } from '@/lib/email';
import { notifyMerchant } from '@/lib/notifications/service';
import { inngest } from './client.js';
import { markFailed, processGeneration } from './workflow.js';

/**
 * Durable `generation.requested` workflow. Per-merchant + global concurrency caps protect provider rate
 * limits and our budget; `processGeneration` handles compose → store → finalize and refunds the credit
 * on terminal failure (so a failed job is never billed).
 *
 * `onFailure` is the safety net for failures that kill the worker *outside* `processGeneration`'s own
 * try/catch — a module-load crash, an OOM, or a function timeout. Without it, such a run would exhaust its
 * retries and leave the generation stuck in QUEUED with the credit still debited. The net marks it failed
 * and refunds (idempotently, so it can never double-refund a row a retry already handled).
 */
export const generationRequested = inngest.createFunction(
  {
    id: 'generation-requested',
    retries: 2,
    concurrency: [
      { limit: Number(process.env.GLOBAL_CONCURRENCY ?? 20) },
      { key: 'event.data.merchantId', limit: Number(process.env.MERCHANT_CONCURRENCY ?? 3) },
    ],
    onFailure: async ({ event, error }) => {
      const generationId = event.data.event.data.generationId;
      reportError(error, { generationId, stage: 'inngest_terminal_failure' });
      const db = getDb();
      const email = emailSenderFromEnv(process.env);
      await markFailed(
        {
          db,
          events: createEventSink(process.env),
          reportError,
          notify: (input) => notifyMerchant(db, { email }, input),
        },
        generationId,
        'generation_failed',
      );
    },
  },
  { event: 'generation.requested' },
  async ({ event, step }) => {
    return step.run('process-generation', async () => {
      const storage = createR2FromEnv(process.env);
      if (!storage) {
        throw new Error('R2 is not configured');
      }
      const orchestrator = createOrchestratorFromEnv(process.env);
      const db = getDb();
      const email = emailSenderFromEnv(process.env);
      return processGeneration(
        {
          db,
          orchestrator,
          storage,
          events: createEventSink(process.env),
          reportError,
          notify: (input) => notifyMerchant(db, { email }, input),
        },
        event.data.generationId,
      );
    });
  },
);

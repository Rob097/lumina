import { getDb } from '@/lib/db';
import { createR2FromEnv } from '@/lib/storage/r2';
import { reportError } from '@/lib/observability';
import { purgeGenerationsOlderThan, type RetentionStorage } from '@/lib/account/purge';
import { inngest } from './client.js';

/**
 * Scheduled data-retention purge (§9). Deletes generations + their room/result objects older than the
 * retention window; the credit ledger is preserved (`generation_id` is `ON DELETE SET NULL`). Window +
 * schedule are env-configurable.
 */
export const retentionPurge = inngest.createFunction(
  { id: 'retention-purge' },
  { cron: process.env.RETENTION_CRON ?? '0 3 * * *' }, // daily at 03:00 UTC
  async ({ step }) => {
    return step.run('purge-old-generations', async () => {
      const r2 = createR2FromEnv(process.env);
      const storage: RetentionStorage = r2 ?? { deleteObject: async () => {} };
      try {
        return await purgeGenerationsOlderThan(getDb(), storage, {
          olderThanDays: Number(process.env.RETENTION_DAYS ?? 90),
        });
      } catch (err) {
        reportError(err, { job: 'retention-purge' });
        throw err;
      }
    });
  },
);

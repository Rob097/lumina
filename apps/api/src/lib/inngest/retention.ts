import { getDb } from '@/lib/db';
import { createR2FromEnv } from '@/lib/storage/r2';
import { reportError } from '@/lib/observability';
import { purgeExpiredAssets, type RetentionStorage } from '@/lib/account/purge';
import { inngest } from './client.js';

/**
 * Scheduled tiered data-retention purge (§9). Deletes the heavy R2 originals — room uploads past
 * `RETENTION_ROOM_DAYS` (default 30, a privacy win), results past `RETENTION_RESULT_DAYS` (default 90) —
 * while preserving the generation row, its metadata, and the long-lived thumbnail so the dashboard keeps
 * its history. The credit ledger is untouched. Windows + schedule are env-configurable.
 *
 * `RETENTION_DAYS` (legacy single window) is still honored as the fallback for the result window.
 */
export const retentionPurge = inngest.createFunction(
  { id: 'retention-purge' },
  { cron: process.env.RETENTION_CRON ?? '0 3 * * *' }, // daily at 03:00 UTC
  async ({ step }) => {
    return step.run('purge-expired-assets', async () => {
      const r2 = createR2FromEnv(process.env);
      const storage: RetentionStorage = r2 ?? { deleteObject: async () => {} };
      const resultDays = Number(process.env.RETENTION_RESULT_DAYS ?? process.env.RETENTION_DAYS ?? 90);
      const roomDays = Number(process.env.RETENTION_ROOM_DAYS ?? 30);
      try {
        return await purgeExpiredAssets(getDb(), storage, { roomDays, resultDays });
      } catch (err) {
        reportError(err, { job: 'retention-purge' });
        throw err;
      }
    });
  },
);

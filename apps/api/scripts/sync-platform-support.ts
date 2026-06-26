/**
 * support:sync — backfill: make every existing workspace have the internal platform-support account(s)
 * as `role='support'` members (so support sees all workspaces). Idempotent + re-runnable (e.g. after
 * adding a new internal account). Future workspaces are covered automatically by `createWorkspace`.
 *
 * Requires env: DATABASE_URL (privileged) + LUMINA_SUPPORT_USER_IDS (comma-separated auth.users UUIDs).
 * Run: `DATABASE_URL=… LUMINA_SUPPORT_USER_IDS=… pnpm -F @lumina/api support:sync`
 */
import { fileURLToPath } from 'node:url';
import { createDb } from '@lumina/db';
import { platformSupportUserIds, syncPlatformSupport } from '../src/lib/account/platform-support.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  const ids = platformSupportUserIds(process.env);
  if (ids.length === 0) {
    console.log('LUMINA_SUPPORT_USER_IDS is empty — nothing to sync.');
    return;
  }
  const { db, client } = createDb(url, { max: 1, prepare: false });
  try {
    const res = await syncPlatformSupport(db);
    console.log(`✓ support:sync — ids=${res.supportIds.join(',')} rows_inserted=${res.enrolled}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

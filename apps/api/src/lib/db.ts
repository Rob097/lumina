import { createDb, type Database } from '@lumina/db';

let cached: Database | undefined;

/**
 * Singleton DB handle for route handlers. Uses the privileged `DATABASE_URL` connection (the public
 * API scopes every query by the merchant resolved from the validated key; RLS is the dashboard-path
 * safety net).
 */
export function getDb(): Database {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    cached = createDb(url).db;
  }
  return cached;
}

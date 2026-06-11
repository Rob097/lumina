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
    // Serverless behind Supabase's transaction pooler: one connection per warm instance, no
    // server-side prepared statements, release idle connections quickly. A larger pool exhausts the
    // shared pooler (EMAXCONNSESSION) once the route + Inngest workflow run concurrently.
    cached = createDb(url, { max: 1, prepare: false, idleTimeout: 20 }).db;
  }
  return cached;
}

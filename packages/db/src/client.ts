import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { schema } from './schema.js';

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;

export interface DbHandle {
  db: Database;
  client: Sql;
}

/**
 * Create a Drizzle client over a postgres.js connection. Callers own the lifecycle and should
 * `client.end()` when done (e.g. scripts/tests). The dashboard/API use the pooled `DATABASE_URL`.
 */
export function createDb(connectionString: string, options: { max?: number } = {}): DbHandle {
  const client = postgres(connectionString, { max: options.max ?? 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

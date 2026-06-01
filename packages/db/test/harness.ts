import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { runMigrations } from '../src/migrate.js';
import { schema } from '../src/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const AUTH_SHIM_PATH = join(here, 'sql', '00_auth_shim.sql');

export type TestSchema = typeof schema;
export type Database = PostgresJsDatabase<TestSchema>;
/** The drizzle transaction client handed to `asUser` callbacks. */
export type TxDatabase = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TestDb {
  /** Privileged client (superuser) — bypasses RLS, mirrors the public-API service role. */
  db: Database;
  sqlClient: Sql;
  /** Run a callback as a signed-in merchant user (role `authenticated` + JWT `sub`), inside a tx. */
  asUser<T>(userId: string, fn: (tx: TxDatabase) => Promise<T>): Promise<T>;
  teardown(): Promise<void>;
}

/**
 * Boot a real Postgres for integration tests: a Testcontainers `postgres:16` by default, or an
 * existing `TEST_DATABASE_URL` (used in CI where a service container is already running). Applies
 * the Supabase auth shim, then the journaled migrations.
 */
export async function setupTestDb(): Promise<TestDb> {
  let connectionString: string;
  let container: StartedPostgreSqlContainer | undefined;

  if (process.env.TEST_DATABASE_URL) {
    connectionString = process.env.TEST_DATABASE_URL;
  } else {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    connectionString = container.getConnectionUri();
  }

  // 1) auth shim (idempotent), 2) journaled migrations.
  const admin = postgres(connectionString, { max: 1 });
  await admin.unsafe(readFileSync(AUTH_SHIM_PATH, 'utf8'));
  await admin.end();
  await runMigrations(connectionString);

  const sqlClient = postgres(connectionString, { max: 5 });
  const db = drizzle(sqlClient, { schema });

  async function asUser<T>(userId: string, fn: (tx: TxDatabase) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      // Establish the Supabase RLS context, then drop privileges to `authenticated` for this tx.
      await tx.execute(
        sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId })}, true)`,
      );
      await tx.execute(sql`set local role authenticated`);
      return fn(tx);
    });
  }

  async function teardown(): Promise<void> {
    await sqlClient.end();
    if (container) {
      await container.stop();
    }
  }

  return { db, sqlClient, asUser, teardown };
}

/** Narrow a query result's first row from `T | undefined` to `T`, throwing if empty. */
export function firstOrThrow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('expected at least one row');
  }
  return row;
}

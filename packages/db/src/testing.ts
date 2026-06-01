import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { runMigrations } from './migrate.js';
import { schema } from './schema.js';

/**
 * Shared integration-test harness (`@lumina/db/testing`). Boots a real Postgres so RLS, plpgsql
 * functions, and constraints are exercised exactly as in production. Reused by `@lumina/db`,
 * `@lumina/api`, and later milestones. Import only from test code.
 */

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
 * Supabase-compatible auth shim. Production Supabase already provides this; here we recreate just
 * enough that the migrations apply unchanged and RLS behaves identically (auth.uid() resolves the
 * JWT subject from the `request.jwt.claims` GUC, exactly like Supabase).
 */
const AUTH_SHIM_SQL = /* sql */ `
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
`;

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

  const admin = postgres(connectionString, { max: 1 });
  await admin.unsafe(AUTH_SHIM_SQL);
  await admin.end();
  await runMigrations(connectionString);

  const sqlClient = postgres(connectionString, { max: 5 });
  const db = drizzle(sqlClient, { schema });

  async function asUser<T>(userId: string, fn: (tx: TxDatabase) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
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

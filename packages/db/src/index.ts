/**
 * @lumina/db — Drizzle schema, client, migrations, RLS, `debit_credits()`, and seed.
 *
 * Migrations are the ONLY way schema changes happen (CLAUDE.md HARD RULE #4). The Supabase MCP is
 * read-only; never mutate through it.
 */
export * from './schema.js';
export * from './client.js';

// NOTE: `runMigrations` (src/migrate.ts) is intentionally NOT re-exported here. It is a CLI/test
// concern that relies on `import.meta.url` to locate the migrations folder, which would be empty in
// the bundled CJS output. Import it directly from `@lumina/db/dist/migrate.js` source in tooling.

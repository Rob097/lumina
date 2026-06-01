# Decisions Log

Non-obvious engineering decisions. Architecture/stack decisions already settled in
`LUMINA_Technical_Architecture.md` are not re-litigated here — this records *implementation* choices.

## M0 — Foundations (2026-06-01)

- **D1 — Toolchain pinned to Node 20.19.0 + pnpm 9.15.4.** `.nvmrc`, `engines`, and `packageManager`
  pin the versions; pnpm is provisioned via Corepack. The machine's default Node was 18.10 (below the
  spec's "Node 20+"), so contributors must `nvm use`.

- **D2 — DB tests run on real Postgres via Testcontainers, not a mock.** RLS, plpgsql
  (`debit_credits`), partial unique indexes, and enums must be exercised on Postgres. The harness uses
  an existing `TEST_DATABASE_URL` when present (CI service container) and otherwise starts
  `postgres:16-alpine`. This makes "migrations apply + RLS verified" provable without a cloud project.

- **D3 — Supabase `auth` shim for tests.** Production Supabase provides `auth.users`, `auth.uid()`, and
  the `anon`/`authenticated`/`service_role` roles; our migrations reference them. `test/sql/00_auth_shim.sql`
  recreates Supabase-compatible equivalents (`auth.uid()` resolves `request.jwt.claims ->> 'sub'`, exactly
  like Supabase) so the **same** migrations apply unchanged on a bare Postgres. Tests simulate a signed-in
  merchant via `set local role authenticated` + a JWT-claims GUC inside a transaction.

- **D4 — Migrations split into generated + custom.** drizzle-kit generates the tables/enums/indexes
  migration (`0000_*.sql`). RLS enable + policies + grants + the `auth.users` FK on `memberships` +
  `current_merchant_ids()` + `debit_credits()` live in a hand-authored custom migration
  (`0001_rls_functions.sql`) because Drizzle does not model those objects. Both are journaled and applied
  in order by `drizzle-kit migrate`. No ad-hoc SQL ever bypasses Drizzle (HARD RULE #4).

- **D5 — `current_merchant_ids()` is `SECURITY DEFINER`.** The architecture DDL left security mode
  implicit; we make it definer (with a fixed `search_path`) so RLS policies can consult `memberships`
  without granting end users direct read access to that table. This tightens isolation versus a
  security-invoker helper.

- **D6 — `memberships.user_id` FK to `auth.users` is added in SQL, not in the Drizzle schema.** Declaring
  `auth.users` as a Drizzle table would make drizzle-kit try to create/manage the Supabase-owned table.
  Instead the column is a plain `uuid` in the schema and the cross-schema FK is added in the custom
  migration (where `auth.users` already exists on Supabase / via the shim in tests).

- **D7 — `runMigrations` is not re-exported from `@lumina/db`'s barrel.** It relies on `import.meta.url`
  to locate the migrations folder, which is empty under the bundled CJS output. It stays a CLI/test
  concern imported directly from source (`src/migrate.ts`, run via tsx).

- **D8 — Apps and `packages/{ai,ui}` are buildable stubs in M0.** The first review is scoped (per the
  build prompt) to the monorepo, `@lumina/shared`, and `@lumina/db`. The other workspaces are minimal,
  type-checked stubs that import the shared contract (proving DB→API→widget type flow) and get their real
  implementations in their milestones (api: M1/M2, widget: M3, dashboard+ui: M4, ai: M2). External
  provisioning (Supabase/Vercel/etc.) is documented in `docs/setup.md`, not executed.

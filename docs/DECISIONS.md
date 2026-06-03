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

## M1 — Auth, tenants, API keys, billing skeleton (2026-06-01)

- **D9 — Server logic lives in `apps/api/src/lib`; route handlers stay thin.** Auth, key, billing, and
  bootstrap logic are framework-agnostic modules so they are unit/integration testable without booting
  Next. No new `core` package (the architecture defines only shared/db/ai/ui).

- **D10 — The Testcontainers harness is shared as `@lumina/db/testing`.** Moved from `test/harness.ts` to
  `src/testing.ts` (ESM-only build entry; the auth shim SQL is inlined so there is no file-path
  dependency in the built package). `@lumina/api` and later milestones reuse one integration-test setup.

- **D11 — API key format `^(pk|sk)_(test|live)_<base64url-secret>$`.** Only `sha256(raw)` + a `prefix`
  (`<tag>_<env>_<first8>`) are stored; verification does a prefix lookup + timing-safe hash compare +
  revoked check. The raw key is revealed exactly once on creation.

- **D12 — `PLAN_CATALOG` in `@lumina/shared`** maps each `plan_tier` → `{ includedCredits, label }`. The
  Stripe webhook resolves price → plan → included credits from this table (no magic numbers in handlers).

- **D13 — Credit grants are atomic + idempotent.** `grant_credits(merchant, amount, reason, ref)` mirrors
  `debit_credits` (bump cache + append ledger in one tx, keeping cache == ledger sum). Stripe webhooks
  dedupe on `webhooks_inbox(id)` so replays never double-grant.

- **D8 — Apps and `packages/{ai,ui}` are buildable stubs in M0.** The first review is scoped (per the
  build prompt) to the monorepo, `@lumina/shared`, and `@lumina/db`. The other workspaces are minimal,
  type-checked stubs that import the shared contract (proving DB→API→widget type flow) and get their real
  implementations in their milestones (api: M1/M2, widget: M3, dashboard+ui: M4, ai: M2). External
  provisioning (Supabase/Vercel/etc.) is documented in `docs/setup.md`, not executed.

## M2 — AI orchestrator + generation workflow (2026-06-01)

- **D14 — `AIProvider` interface; `AIOrchestrator` owns routing/retry/fallback.** `compose(ComposeInput)`
  is the single model entrypoint (HARD RULE #8). A routing policy (`quality|balanced|fast`) maps to an
  ordered provider chain; each provider is retried with exponential backoff, then we fall back to the
  next. Swapping fal ↔ vertex ↔ replicate is one file.

- **D15 — `ImageRef = { url } | { bytes }`.** Providers fetch URLs (uploading bytes to fal storage when
  needed); the orchestrator returns `{ bytes, model, costCents, latencyMs, width, height }` for the
  margin/quality records on `generations`.

- **D16 — R2 storage service lives in `apps/api/src/lib/storage`.** Object keys are always
  merchant-prefixed (`rooms|products|results/{merchant_id}/…`); presigned PUT/GET are computed offline
  via `@aws-sdk/s3-request-presigner` (so they're unit-testable without R2). Cloudflare image-resize URL
  helper for thumbnails.

- **D17 — Workflow = testable pure step functions + a thin Inngest wrapper.** Terminal failure sets
  `status=failed` + `error_code` and refunds via `grant_credits(merchant, credits_spent, 'refund', id)`
  (reuses M1) — we never bill a failed generation (HARD RULE #3).

- **D18 — Idempotency key = `sha256(merchant_id|productRef|roomKey|placementHint)`** enforced by
  `gen_idem_uidx`; an identical recent *succeeded* generation is returned for **0 credits**.

- **D19 — Every model + resolution is env-configured** (`FAL_MODEL_QUALITY/FAST`, `FAL_COST_*`,
  `AI_PROVIDER=mock` forces the deterministic mock for local/e2e).

- **D20 — Realtime via migration** (`0003_realtime.sql`) adding `generations` to the `supabase_realtime`
  publication so row updates push to subscribed widgets.

## M3 — The widget (2026-06-03)

- **D21 — Status transport is polling-primary + pluggable.** The in-bundle transport polls
  `GET /widget/status/:id` with capped exponential backoff (500ms → ×1.5 → 4s) until a terminal status; a
  `StatusTransport` interface is the seam for a future lazy-loaded Supabase Realtime transport. Rationale:
  `@supabase/supabase-js` (~35 KB gz) alone would blow the **< 45 KB** budget (HARD RULE #7), which wins
  where it conflicts with the Realtime preference. `/widget/status/:id` is the spec's designated fallback.

- **D22 — Two-stage build: immutable loader + content-hashed app.** `build.mjs` builds the app first
  (`widget.[hash].js`), then the loader with that URL injected via Vite `define` (`__APP_BUNDLE_URL__`),
  emitting the year-cacheable `widget.js`. The loader has **no imports** (its own dependency-free trigger
  reader) so it stays ~1.7 KB raw / 0.8 KB gz; the zod-based `parseTrigger` lives only in the app bundle.

- **D23 — Framework-agnostic core, thin Preact view.** All flow logic (config, API client, the
  `LuminaController` state machine, status, i18n, image pipeline) is pure/injectable in `src/core`,
  unit-tested under happy-dom; `src/ui` Preact components only render controller state. Keeps logic testable
  without rendering and the bundle lean (app bundle 30.9 KB gz).

- **D24 — Client image pipeline = downscale ≤ 2048 + EXIF-orientation fix + re-encode (WebP→JPEG).**
  Re-encoding through a canvas strips EXIF/GPS client-side (defense-in-depth for HARD RULE #9; the server
  strips again). `computeTargetSize`/`parseExifOrientation`/`pickEncoding`/`applyOrientation` are pure +
  tested; the canvas `processImage` shell is E2E-covered.

- **D25 — Anonymous visitor id** is a client-generated UUID persisted in `localStorage` (`lumina_anon_id`),
  sent as `anonId` for per-visitor abuse caps (§3.9); tolerates blocked storage with an ephemeral id.

- **D26 — Bundle-budget gate.** `build.mjs` fails the build if the gzipped app bundle exceeds 45 KB; an
  explicit `pnpm -F @lumina/widget size` step in CI surfaces it. The widget validates API responses with
  the shared zod schemas via a structural `Parser<T>` type (no direct `zod` dependency, keeps imports lean).

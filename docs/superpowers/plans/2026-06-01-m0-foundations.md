# M0 — Foundations Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans / TDD to implement task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the LUMINA Turborepo with the shared contract package (`@lumina/shared`)
and the database package (`@lumina/db`) — full schema per architecture §5, RLS, `debit_credits()`,
migrations, seed, and tests proving tenant isolation + atomic debit — so `pnpm i && pnpm build && pnpm test`
is green.

**Architecture:** pnpm workspaces + Turborepo. `packages/shared` holds Zod schemas/types reused by every
plane. `packages/db` holds Drizzle schema + hand-written SQL migrations (RLS, policies, grants, functions)
applied to a real Postgres. DB tests boot an ephemeral Postgres (Docker via Testcontainers, or a CI service
container) with a small **Supabase-compatible `auth` shim** so RLS behaves exactly as it will in production.

**Tech Stack:** Node 20.19 (nvm) · pnpm 9.15 (corepack) · TypeScript 5 strict · Turborepo · Drizzle ORM +
drizzle-kit · postgres.js · Zod · Vitest · Testcontainers · ESLint 9 (flat) + Prettier · Husky.

---

## Scope of this plan (Checkpoint A)

The user's "right now" instruction scopes the **first review** to: monorepo scaffold + tooling,
`packages/shared`, and `packages/db` (schema + RLS + `debit_credits` + migrations + seed + tests).

In-scope:
- Workspace tooling: `pnpm-workspace.yaml`, root `package.json`, `turbo.json`, `tsconfig.base.json`,
  ESLint flat config, Prettier, Husky pre-commit, `.gitignore`, root README.
- `packages/shared`: Zod schemas + inferred types for enums, error codes/envelope, event names,
  `LuminaConfig`, `OpenOptions`, widget config, product, `generate` request/response, `sign-upload`,
  `status`, `feedback`, `event`. Unit tests (Vitest).
- `packages/db`: Drizzle schema (§5), migrations (tables + indexes + enums via drizzle-kit; RLS + policies +
  grants + `current_merchant_ids()` + `debit_credits()` as a custom SQL migration), seed script, and
  integration tests (Testcontainers Postgres) proving: atomic debit success, `INSUFFICIENT_CREDITS`,
  refund flow, and RLS tenant isolation.
- `.env.example` (root + per app), `docs/setup.md`, `docs/DECISIONS.md`, CI workflow.
- Minimal **valid stubs** for `apps/{dashboard,api,widget}` and `packages/{ai,ui}` so the workspace
  resolves and `turbo build/lint/typecheck/test` succeed workspace-wide. Real app/AI/UI implementation is
  deferred to M1–M4 per the milestone plan.

Deferred (documented, not executed): provisioning real Supabase/Vercel/Cloudflare/Upstash/Stripe/fal/
Sentry/Axiom accounts. DB correctness is proven against a real Postgres container, so migrations are
verified to apply without a cloud project.

---

## Key decisions (also recorded in docs/DECISIONS.md)

1. **Node 20.19 + pnpm 9.15** via nvm + corepack. Repo pins `packageManager` and `.nvmrc` + `engines`.
2. **DB tests run on real Postgres in Docker (Testcontainers)**, not a mock. Rationale: RLS, plpgsql
   (`debit_credits`), partial unique indexes, and enums must be exercised on Postgres. Hybrid harness:
   if `TEST_DATABASE_URL` is set (CI service container) use it; else start a Testcontainers `postgres:16`.
3. **Supabase `auth` shim for tests.** Production Supabase provides `auth.users` and `auth.uid()`. Our
   migrations reference them. For the test DB we pre-apply `test/sql/00_auth_shim.sql` that creates the
   `auth` schema, `auth.users`, roles `anon`/`authenticated`/`service_role`, and an `auth.uid()` reading
   `current_setting('request.jwt.claims', true)::jsonb ->> 'sub'` — exactly how Supabase resolves the JWT
   subject. Tests simulate a signed-in merchant user with
   `set role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);`.
4. **Migrations split:** drizzle-kit generates the table/enum/index migration from the Drizzle schema; a
   second **custom** migration (`drizzle-kit generate --custom`) holds RLS enable + policies + grants to
   `authenticated` + `current_merchant_ids()` + `debit_credits()`. Both are plain SQL under
   `packages/db/drizzle/` and applied in journal order by `drizzle-kit migrate`. No ad-hoc SQL ever
   bypasses Drizzle (HARD RULE #4).
5. **Apps are separate** (`apps/dashboard`, `apps/api`, `apps/widget`) per architecture Appendix B; for M0
   they are buildable stubs.
6. **`credits_balance` is a denormalized cache** of the ledger; `debit_credits()` keeps them consistent in
   one transaction. Seed grants initial credits via both the ledger and the cache.

---

## File structure (created in this plan)

```
lumina/
├─ package.json                      # root, private, workspace scripts
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ eslint.config.mjs                 # flat config, shared
├─ .prettierrc.json / .prettierignore
├─ .gitignore
├─ .nvmrc
├─ .env.example                      # root aggregate
├─ .husky/pre-commit
├─ README.md
├─ docs/setup.md
├─ docs/DECISIONS.md
├─ .github/workflows/ci.yml
├─ packages/
│  ├─ shared/
│  │  ├─ package.json  tsconfig.json  tsup.config.ts  vitest.config.ts
│  │  └─ src/{index,enums,errors,events,config,product,widget,generate}.ts + *.test.ts
│  ├─ db/
│  │  ├─ package.json  tsconfig.json  drizzle.config.ts  vitest.config.ts
│  │  ├─ src/{index,client,schema,seed}.ts
│  │  ├─ drizzle/0000_*.sql 0001_rls_functions.sql meta/_journal.json
│  │  └─ test/{harness.ts, sql/00_auth_shim.sql, debit_credits.test.ts, rls.test.ts}
│  ├─ ai/    (stub)  package.json tsconfig.json src/index.ts
│  └─ ui/    (stub)  package.json tsconfig.json src/index.ts
└─ apps/
   ├─ api/        (stub buildable)
   ├─ dashboard/  (stub buildable)
   └─ widget/     (stub buildable)
```

---

## Tasks

### Task 1: Workspace skeleton + tooling
- [ ] root `package.json` (private, `packageManager`, `engines`, scripts: dev/build/lint/typecheck/test/db:*)
- [ ] `pnpm-workspace.yaml` (`apps/*`, `packages/*`)
- [ ] `turbo.json` pipelines: build (dependsOn ^build), lint, typecheck, test (dependsOn ^build), db:* passthrough
- [ ] `tsconfig.base.json` strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
- [ ] `eslint.config.mjs` flat (typescript-eslint, no-explicit-any error), `.prettierrc.json`, ignores
- [ ] `.gitignore`, `.nvmrc` (20.19.0), root `README.md`
- [ ] `git init`; commit `chore: scaffold turborepo workspace and tooling`

### Task 2: Minimal valid stubs (apps + ai/ui)
- [ ] `packages/ai` and `packages/ui`: `package.json` + `tsconfig.json` + `src/index.ts` (export a const),
      build via tsup, test = no-op passing, typecheck clean.
- [ ] `apps/api`, `apps/dashboard`, `apps/widget`: minimal package.json with build/lint/typecheck/test
      scripts that succeed (placeholder build). Keep heavy frameworks out until their milestone.
- [ ] commit `chore: add buildable stubs for apps and ai/ui packages`

### Task 3: packages/shared (TDD)
Write Vitest tests first for each schema, watch them fail, then implement.
- [ ] enums: `ProductCategorySchema`, `GenerationStatusSchema`, `KeyKind/KeyEnv`, `MemberRole`,
      `LedgerReason`, `PlanTier`, `LocaleSchema` — values exactly per §5.2 / §3.4.
- [ ] errors: `ErrorCode` union (`invalid_key`,`domain_not_allowed`,`rate_limited`,`insufficient_credits`,
      `invalid_input`,`unsupported_image`,`generation_failed`,`not_found`) + `ErrorEnvelopeSchema`
      `{ error: { code, message, requestId } }`.
- [ ] events: `EVENT_NAMES` const + `WidgetEventSchema` matching §3.6.
- [ ] config: `LuminaConfigSchema`, `ThemeSchema`, `OpenOptionsSchema` per §3.4.
- [ ] product: `ProductSchema`, `ProductInputSchema`, `DimensionsSchema`.
- [ ] widget: `WidgetConfigResponseSchema` per §6.2 GET /widget/config.
- [ ] generate: `SignUploadRequest/Response`, `GenerateRequest/Response`, `StatusResponse`,
      `FeedbackRequest`, `EventBeaconRequest` per §6.2.
- [ ] `src/index.ts` barrel export. `tsup` build (esm+cjs+dts). `pnpm -F @lumina/shared test` green.
- [ ] commit `feat(shared): zod contracts and types for widget/api/dashboard`

### Task 4: packages/db schema + migrations
- [ ] `client.ts`: postgres.js + drizzle factory from `DATABASE_URL`.
- [ ] `schema.ts`: pgEnums + all tables/indexes from §5.2 exactly (merchants, memberships, api_keys,
      products, widget_configs, generations, generation_assets, credit_ledger, usage_events,
      subscriptions, webhooks_inbox, audit_log). `memberships.user_id` references `auth.users` (declared
      as an external pgSchema table so Drizzle emits the FK but does not try to manage it).
- [ ] `drizzle.config.ts`. Generate base migration: `pnpm -F @lumina/db db:generate`.
- [ ] custom migration `0001_rls_functions.sql`: `enable row level security` on the six tables,
      `current_merchant_ids()`, tenant_read/tenant_write policies per table, `grant`s to `authenticated`,
      and `debit_credits(p_merchant,p_amount,p_gen)` verbatim per §5.2.
- [ ] commit `feat(db): drizzle schema, rls policies and debit_credits migration`

### Task 5: packages/db tests (TDD, Testcontainers)
- [ ] `test/sql/00_auth_shim.sql`: auth schema + `auth.users` + roles + `auth.uid()` (reads jwt claims GUC).
- [ ] `test/harness.ts`: start Testcontainers `postgres:16` (or use `TEST_DATABASE_URL`); apply auth shim;
      run `drizzle-kit migrate`; return a drizzle client + a `asUser(userId, fn)` helper that sets
      `role authenticated` + jwt claims in a transaction.
- [ ] `debit_credits.test.ts` (write first → fail): (a) debits 1, balance−1, ledger row `-1/generation`;
      (b) insufficient → throws `INSUFFICIENT_CREDITS`, no balance change, no ledger row; (c) refund:
      insert `+1/refund` restores balance via app code path.
- [ ] `rls.test.ts` (write first → fail): seed two merchants A,B each with a user; as A's user, selecting
      `products`/`generations` returns only A's rows; insert into B with check violation fails.
- [ ] `pnpm -F @lumina/db test` green. commit `test(db): rls isolation and atomic debit_credits`

### Task 6: seed script
- [ ] `src/seed.ts`: idempotent — one demo merchant + owner membership (needs an `auth.users` row; in the
      shimmed/local DB create it; document that on real Supabase the user is created via Auth), pk/sk
      test+live key rows (store sha256 hashes), 3 demo products, an active widget_config, and an initial
      credit grant (ledger `+N/grant` and matching `credits_balance`).
- [ ] `pnpm -F @lumina/db db:seed` runs against the test/local DB. commit `feat(db): demo seed script`

### Task 7: env, docs, CI
- [ ] `.env.example` (root) + `apps/*/.env.example` from Appendix A. `docs/setup.md` listing every external
      account + local dev (`docker`, nvm, pnpm) + how to run migrations/seed/tests.
- [ ] `docs/DECISIONS.md` capturing the decisions above.
- [ ] `.github/workflows/ci.yml`: Node 20 + pnpm cache; `pnpm i`; `pnpm lint && pnpm typecheck && pnpm build`;
      db tests with a `postgres:16` service + `TEST_DATABASE_URL`.
- [ ] Husky `pre-commit` → `pnpm lint && pnpm typecheck`.
- [ ] Full run: `pnpm i && pnpm build && pnpm test`. commit `chore: env examples, setup docs and CI`

---

## Self-review checklist
- Spec coverage: M0 tasks (scaffold, shared, db schema/RLS/debit/migrations/seed, env/docs) → Tasks 1–7. ✓
- Schema fidelity: every table/enum/index/function copied from §5.2 (no drift). ✓
- Contracts fidelity: shared schemas mirror §3.4 / §6.1 / §6.2 / §3.6 names exactly. ✓
- HARD RULES: no secrets committed; migrations only via Drizzle; tenant scoping baked into RLS; `debit_credits`
  before enqueue (consumed by API in M2). ✓

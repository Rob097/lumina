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

## M4 — Merchant dashboard (2026-06-03)

- **D27 — Design system = global CSS from `packages/ui`.** The Claude Design bundle's three stylesheets are
  copied verbatim into `packages/ui/styles/{tokens,components,app}.css`, re-exported as `@lumina/ui/styles.css`,
  imported once in the dashboard root layout; screens use the prototype class names for pixel fidelity. Fonts
  load via the design's Google-Fonts `@import` (next/font optimization deferred to M5). The prototype HTML is
  archived under `docs/design/` for reference.

- **D28 — Dashboard ↔ API over HTTP with the forwarded Supabase session.** All merchant endpoints live in
  `apps/api` (§6.1 "same Vercel app"); the dashboard's server components/actions call them via `lib/api.ts`
  (cookie-forwarding `apiFetch`) and validate responses with shared Zod schemas. No DB access or secrets in
  the dashboard (HARD RULE #2).

- **D29 — Analytics via merchant-scoped SQL aggregation.** `summary`/`timeseries` are computed in `apps/api`
  over `usage_events` + `generations` (RLS-enforced, scoped by `merchant_id`), shaped to Zod response
  schemas. Metrics use the event types the widget actually emits (impression/open/cta) + the generations
  table — no fabricated numbers; the dashboard renders skeletons + empty states.

- **D30 — Recharts for large charts; inline SVG for sparklines/funnel.** The Overview timeseries (and later
  Analytics) use Recharts styled with the `--viz-*` tokens; KPI sparklines + the funnel bars stay inline SVG
  (as the prototype) to keep pages light.

- **D31 — Theme + env are client state in a thin provider.** Light/dark via `:root[data-theme]` (the design
  tokens define both) with a no-flash inline script; the Test/Live env toggle persists in a cookie. Both are
  exposed via a small client provider so server components stay the default.

- **D32 — Widget Settings persists the editable subset to the active `widget_configs` row.** The merchant
  `GET/PUT /v1/widget-config` reads/upserts the merchant's single **active** row — the same row the public
  `GET /v1/widget/config` derives the shopper response from — so a save is reflected by the live widget
  immediately, and exactly one active row is kept (no `widget_active_uidx` conflict). The editable
  `WidgetSettingsSchema` (`packages/shared`) is a tighter, validated mirror (hex accent, 0–24px radius,
  ≤32-char label) of the permissive runtime `ThemeSchema`; the in-dashboard live preview is driven from the
  same settings via a pure `previewVars`. Only settings the widget actually honors are exposed — the
  prototype's non-functional "show icon" toggle is omitted (honesty, as with the funnel).

- **D33 — The install snippet shows the publishable-key *prefix*, never a fabricated key.** API keys are
  reveal-once (D11), so the Script & Install screen renders the active env's `pk_…` prefix with guidance to
  paste the full value captured at creation (or roll a new key in Settings) — the dashboard never reconstructs
  or exposes a working key client-side (HARD RULE #2). The loader-script + trigger-button builders are pure
  and unit-tested; the snippet content reacts to the global Test/Live env toggle.

- **D34 — Onboarding completion is derived from live signals, not stored flags.** `deriveOnboarding` computes
  each step's done state from real merchant data (widget config ≠ shipped defaults, product try-on activity,
  domains/impressions for "installed", generations for "go-live"), so the checklist always reflects what the
  merchant has actually done and needs no extra persistence. The "has products" signal is a temporary proxy
  (products with activity) that Phase C upgrades to the real catalog count.

- **D35 — Products: soft-delete + `external_id` bulk upsert; CSV parsed client-side.** `DELETE /products/:id`
  archives (`active = false`) so historical generations keep their product reference; `POST /products/bulk`
  upserts by `external_id` inside a transaction and reports `{ created, updated }`. The Import flow parses the
  file with a pure, fully-tested `parseProductsCsv` (header aliases, quoted fields, per-row errors with line
  numbers) before sending validated rows — invalid rows are surfaced inline, never silently dropped. The
  Products list filters/searches the loaded page in-memory (catalog ≤ 100/page) to avoid round-trips.

- **D36 — Generations: keyset pagination + injected image URLs.** `GET /generations` is cursor-paginated with a
  `(created_at, id)` keyset and an opaque base64 cursor (stable under ties), newest-first. Product name/category
  come from the stored `product_snapshot` so they survive product deletion. Result/room URLs are derived through
  an **injected** builder (R2 `resizeUrl`, D16) so the service is unit-testable without storage and returns
  `null` → a styled placeholder when R2 is unconfigured (no fake images). The dashboard before/after wipe reuses
  the unit-tested `pctFromPointer`/`clampSliderPct` math.

- **D37 — Analytics screen reuses the Phase-A API + Overview components.** The dedicated Analytics page is
  server-rendered with a range selector (7/30/90d via `?range`, day/week interval) over the **same**
  `/analytics/{summary,timeseries}` endpoints and the Overview's KPI / funnel / timeseries / top-products
  components — no new API and no duplicated metric logic. The shared overlay scaffold (drawer/modal/form-field
  CSS) was extracted to `(app)/overlay.css`, imported once by the app-group layout.

- **D38 — Plan presentation is separate from the billing contract.** `PLAN_PRESENTATION` (price/features/
  highlight) lives beside `PLAN_CATALOG` but is **display-only** — list prices are business copy, never
  authoritative for charging (the real amount is the Stripe price resolved from env at checkout, `priceForPlan`).
  `GET /v1/billing/plans` composes the two via the pure `buildBillingPlans(currentPlan)`; the dashboard's
  `planCta`/`planRank`/`formatPrice` are pure + unit-tested. Upgrade/switch routes through the existing Stripe
  Checkout; "Manage billing" through the existing portal — Phase D adds no new money path.

- **D39 — Team emails come from a read-only `auth.users` reference, not a managed table.** `GET /v1/team` joins
  `memberships` to a locally-declared `pgSchema('auth').table('users', …)` (id + email only) so member emails
  resolve with a type-safe join — but because it lives in the service (not `schema.ts`), drizzle-kit never
  manages the Supabase-owned table (consistent with D6). Merchant-scoped (HARD RULE #1), Testcontainers-tested
  against the auth shim.

- **D40 — Danger zone is honest: cancel via portal, deletion via a GDPR request.** "Cancel subscription" links
  to the real Stripe portal; "Delete account" requires typing the store name and then opens a pre-filled GDPR
  erasure request to the DPO — the dashboard never fakes an irreversible deletion it can't perform. API keys are
  created through the existing reveal-once endpoint and shown once in a copy modal (HARD RULE #2); domains are
  validated client-side with the shared `HostnameSchema` before the `PUT`. *(Superseded by D43: the real
  `DELETE /v1/merchant` endpoint now backs the danger zone.)*

## M5 — Hardening & deploy (2026-06-05)

- **D41 — Moderation = a pure policy behind a provider seam.** `classifyInput`/`classifyOutput` are pure +
  unit-tested (reject unsafe content, non-interior rooms, and face-dominant photos for non-fashion categories);
  the classifier itself lives behind a `ModerationProvider` (mirrors `AIProvider`, HARD RULE #8). The workflow
  runs **validate → compose → moderate**; a reject is terminal and **refunds** the credit (never bill a rejected
  generation, HARD RULE #3). `WorkflowDeps.moderation` defaults to an always-safe mock so local/e2e stay green;
  the real fal/vision classifier is wired at deploy.

- **D42 — Server-side EXIF strip = a pure JPEG segment stripper, sanitize-on-ingest.** `stripJpegMetadata`
  drops APP1–APP15 + COM (EXIF/GPS/XMP/IPTC) while preserving JFIF, the frame, and the scan — no native deps
  (no `sharp`). The workflow re-stores the room object stripped before compose, defense-in-depth atop the
  widget's canvas re-encode (D24). Non-JPEG (already-clean WebP/PNG) passes through untouched.

- **D43 — GDPR erasure + retention via FK cascade; the ledger is preserved.** `purgeMerchant` deletes the
  merchant row (every tenant table cascades on `merchant_id`) + R2 objects by `{root}/{merchant_id}/` prefix;
  `DELETE /v1/merchant` is **owner-only** and the dashboard danger zone calls it then signs out. Retention
  `purgeGenerationsOlderThan` deletes old generations + their room/result objects on an Inngest cron
  (`RETENTION_DAYS`/`RETENTION_CRON`); the credit ledger survives because `generation_id` is `ON DELETE SET
  NULL`, so balances never drift. Testcontainers-verified (cascade, tenant isolation, ledger integrity).

- **D44 — Observability seams are env-gated + no-op offline.** `generationEvent` (pure) shapes
  cost/latency/model/status; `createEventSink` POSTs to **Axiom** only when `AXIOM_TOKEN`+`AXIOM_DATASET` are
  set (console fallback otherwise), fire-and-forget so telemetry never breaks a request. Emitted from every
  workflow terminal path (success + each failure/reject) for the margin/failure-rate dashboards. **Sentry**
  init stays a documented deploy step — the SDK isn't added pre-deploy to avoid heavy deps before the joint
  deploy session.

- **D45 — Eval harness: pure `scoreEval` + a mock-driven runner.** `scoreEval` aggregates success / latency /
  cost / 👍 rate by category (pure, tested); `pnpm -F @lumina/api eval` composes a golden set through the
  orchestrator (mock offline, real fal when `FAL_KEY` is set) and prints the report. **Deploy is configured
  but not executed** — `infra/` (Cloudflare R2 + widget-CDN Worker + WAF notes), per-app `vercel.json` +
  `build:next`, `docs/deploy.md`, and `docs/release-checklist.md` are in place; provisioning with the vendor
  CLIs (HARD RULE #10) is a deliberate collaborative step.

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

- **D46 — Staging lockdown migration `0004`: Supabase default privileges silently exposed the server-only
  tables.** On the live Supabase project, the six tables never granted in 0001 (`api_keys`, `audit_log`,
  `generation_assets`, `memberships`, `subscriptions`, `webhooks_inbox`) were still readable AND writable via
  PostgREST with the public `anon` key, because Supabase's project DEFAULT PRIVILEGES auto-grant
  `anon`/`authenticated` on every new `public` table — a gap the bare-Postgres Testcontainers harness can't
  surface (it has no such defaults). `0004_lockdown_server_tables.sql` does `REVOKE ALL … FROM anon,
  authenticated` + `ENABLE ROW LEVEL SECURITY` on those six (deny-all to client roles; the table-owner
  `postgres` role and `service_role` bypass RLS, so the API/workflow are unaffected and the dashboard never
  touches them per D28), and pins `search_path` on `debit_credits`/`grant_credits` (linter 0011). Verified via
  `has_table_privilege` (anon/authenticated denied, service_role retained) + the advisors (critical
  `rls_disabled_in_public` and the function WARNs cleared; the remaining `rls_enabled_no_policy` INFOs are the
  intended deny-all state). The `current_merchant_ids` SECURITY-DEFINER WARN is by design — the RLS policies
  call it and it returns empty for `anon`.

- **D47 — Axiom telemetry posts to a full, configurable ingest URL (`AXIOM_URL`).** The staging Axiom token
  authenticates against the US deployment but the `lumina` dataset lives in the EU region, and only the
  **edge** endpoint accepts it: `https://<region>.aws.edge.axiom.co/v1/ingest/<dataset>` (the standard
  `api.eu.axiom.co/v1/datasets/<ds>/ingest` returns 403). So `createEventSink` now treats `AXIOM_URL`, when
  set, as the **complete ingest URL** (used verbatim) and otherwise builds the default
  `https://api.axiom.co/v1/datasets/<AXIOM_DATASET>/ingest`. Still fire-and-forget; unset ⇒ console fallback.
  Region/endpoint is now deployment config, not a code constant.

- **D48 — CI/CD: push to `master` is the deploy.** Vercel's Git integration auto-builds + deploys both apps
  on every push. `ci.yml` gained a **`migrate`** job (`needs: quality`, master-push only) that runs
  `pnpm db:migrate` with the `DATABASE_URL` **Actions secret** (Supabase **session pooler** 5432 — the
  transaction pooler breaks the migrator). The test task graph is serialized on CI (`pnpm test --
  --concurrency=1`): the db + api integration suites share the single CI Postgres, so parallel `turbo`
  tasks raced on migration DDL (`duplicate pg_type` / `tuple concurrently updated`); locally each package
  gets its own Testcontainers DB so dev stays parallel. Agent pushes use a fine-grained GitHub PAT
  (`GITHUB_TOKEN` in `.env.dev`) via an ephemeral git credential-helper (never persisted). Inngest auto-sync
  (Vercel integration) + widget-CDN upload remain follow-ups.

- **D49 — AI compositing moves from fal.ai to the Vercel AI Gateway, single multimodal path.** The provider
  behind `AIOrchestrator` (HARD RULE #8) is now `GatewayProvider` (`packages/ai/providers/gateway.ts`),
  swapped in via `factory.ts` — fal.ai (`fal.ts`) is kept **dormant** so the swap stays reversible. Both
  tiers use **one** code path: AI SDK 6 `generateText` against a multimodal image model, with the room +
  product passed as **message image parts** (ROOM first, PRODUCT second) and the result read from
  `result.files`. We deliberately chose this over `experimental_generateImage`: in AI SDK 6.0.198
  `generateImage` has **no typed reference-image parameter** (editing would ride provider-specific
  `providerOptions`), whereas multimodal messages are first-class and typed. Consequence: the **fast tier is
  Nano Banana 2** (`google/gemini-3.1-flash-image-preview`) instead of FLUX.2 — spec-allowed ("fast tier
  FLUX.2 / NB2") and same robust path; quality stays **Nano Banana Pro** (`google/gemini-3-pro-image`).
  FLUX-as-fast would need an additive `generateImage` path later. Auth is `AI_GATEWAY_API_KEY` locally and
  **`VERCEL_OIDC_TOKEN`** on Vercel (no key to manage); models/costs are env-configured
  (`GATEWAY_MODEL_*`, `GATEWAY_COST_*`). The network call is an **injectable runner** so the provider's
  input-ordering + output-extraction logic is unit-tested without hitting the gateway.

- **D50 — Dashboard serves stored images as signed R2 GET URLs, not resize-CDN URLs (defers D16).**
  The generations dashboard built image URLs as `${R2_PUBLIC_BASE}/cdn-cgi/image/.../<key>`, but we never
  provisioned a Cloudflare-fronted **public** bucket domain with Image Resizing, and `R2_PUBLIC_BASE` is
  unset in production — so every result/room image resolved to a dead, root-relative path (404). The widget
  path already served these objects via **short-lived signed GET URLs** (`presignDownload`); the dashboard
  now does the same — `generationImageDeps` takes an injectable storage and its `imageUrl` is **async**,
  returning a signed URL or `null` when storage is unconfigured / there is no result yet. This keeps the
  bucket **private** (HARD RULE #9 — room photos are people's homes) and needs zero DNS/CDN setup. The
  resize-CDN optimization (D16) can return once a real CF-fronted domain exists; until then we never emit a
  `/cdn-cgi/image/` URL. An `<img>` GET of a presigned URL is not CORS-gated, and the bucket CORS already
  allows GET. (Vitest in `apps/api` gained a `@/* → src/*` alias so lib files using the alias are testable.)

- **D51 — The widget renders its own styled launcher button into a `[data-lumina-button]` placeholder.**
  Previously the widget only bound a click onto a merchant's own element, so the storefront showed an
  unstyled host button while the dashboard preview promised a branded one. Now a merchant drops an empty
  `<div data-lumina-button data-lumina-product="SKU">` where they want the button and the widget paints
  LUMINA's "Try in your room" button into it — inside **its own Shadow root** (HARD RULE #7, styles never
  leak), themed from the effective config, label = `effective.buttonText`. `core/launcher.ts` is plain DOM
  (no extra Preact roots → negligible bundle cost; size test still green), idempotent (a `WeakSet` guards
  re-mount), and a `MutationObserver` mounts placeholders added later (SPA grids). Declarative
  `[data-lumina-trigger]` elements keep the old enhance-the-merchant's-element behavior, so both models
  coexist. The install snippet (`buildTriggerSnippet`) now emits the placeholder, not a `<button>`.

- **D52 — The dashboard live preview renders the REAL widget UI, not a mock.** The preview was a
  hand-built React mock (`WidgetPreview`) that drifted from the shipped widget (e.g. it invented an
  "Upload" button the real upload step never had). The widget now publishes a self-contained
  `@lumina/widget/preview` library (built by `tsup.preview.config.ts`): it bundles **its own preact**
  and inlines `styles.css` as a string (a tiny plugin strips Vite's `?inline` query; tsup's
  `loader: { '.css': 'text' }` keeps it a string instead of a stylesheet), and exports
  `mountWidgetPreview(container, { view, settings })`. The dashboard's `RealWidgetPreview` (React) mounts
  it into a **Shadow root** from a `useEffect`, themed by the merchant's *unsaved* form settings — so the
  preview IS the widget and can't drift. Bundling preact sidesteps the React↔preact JSX-runtime clash and
  any dedupe worry. Turbo wiring: `@lumina/widget` `build` now also emits `dist-preview/**` (added to the
  build `outputs`), so `turbo build:next` on Vercel produces it before the dashboard compiles. The old
  mock markup is gone; `lib/widget` preview helpers (`previewVars`/`isDarkPreview`) are now unused but
  kept (still unit-tested).

## Post-go-live wave A — Quick UI wins (2026-06-11)

- **D53 — One `lib/platforms.ts` drives both the install picker and the Result-CTA presets; brand marks
  are colour tiles, not vendor logos.** The Script & install page opens on a platform picker — only the
  generic `script` card is live (it works anywhere); WordPress/Shopify/WooCommerce/Wix/Squarespace are
  `status: 'coming-soon'`. The same module exports CTA presets (Shopify `/cart/add?id={productId}`,
  WooCommerce `/?add-to-cart={productId}`, Wix product page, a generic `{productUrl}`) so the Widget
  Settings "quick fill" buttons stay in sync with the installer list. `BrandIcon` renders a brand-coloured
  rounded tile + short white monogram rather than copying each vendor's trademarked SVG path — recognisable
  by colour+mark, no forged/low-fi logo art, scales at any size, and the data layer is unit-tested in a
  Node env (no component-render harness exists in the dashboard, so the JSX is verified by typecheck+lint).

- **D54 — Shopper custom instructions are a *soft preference* under the HARD RULES, and join the
  idempotency key.** The widget confirm step gained an optional free-text field (`customInstructions`,
  ≤ 280 chars, a `<details>` disclosure so it's zero-JS and costs ~0.7 KB gz). It rides the existing
  `generate` request → new nullable `generations.custom_instructions` (migration 0006) → `compose`. In the
  prompt it's quoted (quotes collapsed) and labelled "ADDITIONAL USER PREFERENCE … must not override
  product identity, room integrity, scale, or framing", rendered **after** the HARD-RULES block — untrusted
  text can refine placement/style but never relax the protected rules (it also passes the existing input
  moderation step). It's added to `computeIdempotencyKey` so two different instructions are two distinct
  paid generations rather than colliding on a cached result.

## Post-go-live wave B — Responsive (2026-06-12)

- **D55 — The dashboard sidebar becomes an off-canvas drawer on ≤1024px instead of vanishing.** The shell
  grid previously did `@media (max-width:1024px){ .side{display:none} }` — below a tablet the nav simply
  disappeared, leaving no way to navigate. Now a hamburger (`Icon name="menu"`) in the `Topbar` toggles a
  `NavContext` (added to the existing client `providers.tsx`); the `Sidebar` reads it, slides in as a
  `position:fixed` drawer (`transform: translateX`) over a click-to-dismiss `.side-scrim`, above the modal
  z-layer. The context auto-closes on `usePathname` change (following a nav link closes it) and toggles
  `body.nav-locked` to stop background scroll. Desktop (>1024px) is unchanged: the drawer/scrim/toggle
  rules live *inside* the breakpoint, the toggle is `display:none`. Supporting reflow: wide `<table>`s are
  wrapped in `.table-scroll` (overflow-x, `min-width:520px`) so they scroll instead of breaking the page
  (Products, API keys, credit ledger); the overview KPI grid drops 4→2→1 columns and the product
  dimensions row 4→2 on phones; topbar/content padding tightens on mobile. The **widget was already
  mobile-first** (bottom-sheet < 640px, centred ≥ 640px, `max-height:92vh`+scroll) so it only needed the
  close target bumped to 40px and a Playwright 360px-viewport test (modal fits, custom-instructions field
  reachable). Dashboard responsive is verified by typecheck/lint/build + the documented matrix in its
  README; live device checks happen on staging (the authed shell can't run headless in CI without the DB).

## Post-go-live wave C — Notifications (2026-06-12)

- **D56 — Notifications are actionable-only, fanned out per member, in-app + email, polled (not pushed
  yet).** Three types only — `generation_failed`, `low_credits`, `payment_failed` — never a per-success
  ping (that would be noise on a busy store). Each event **fans out one row per merchant member**
  (`notifications.user_id`, FK `auth.users`) so read-state is per-person; `notification_prefs` holds each
  member's `type → {inApp,email}` toggles (defaults: both on). Both tables are server-written (service
  role) with a user-scoped RLS read policy (`user_id = auth.uid()`) and `notifications` is in the Realtime
  publication — so they're defense-in-depth safe *and* Realtime-ready (migration 0007 generated the tables;
  the FK/RLS/grants/publication are hand-appended to that file, like 0001). **Email** goes through a small
  `EmailSender` port (`apps/api/src/lib/email`): a Resend REST adapter (no SDK dep) when `RESEND_API_KEY`
  is set, else a no-op — so in-app always works and email turns on once the key + verified `RESEND_FROM`
  exist. `notifyMerchant` is **best-effort**: email failures are swallowed (`Promise.allSettled`) so a
  producer like a failed generation still refunds cleanly. Producers: `generation_failed` from the three
  workflow failure exits (via an optional `notify` dep), `low_credits` emitted **once as the balance
  crosses the threshold downward** (20) from the debiting path, `payment_failed` from a new
  `invoice.payment_failed` branch in the Stripe webhook (merchant resolved via `subscriptions`). The
  **bell polls** the API every 60s (seeded server-side, no flash) rather than subscribing — there is no
  client Realtime in the app yet and the widget already chose polling (D21); the publication makes a push
  transport a later drop-in. Dashboard→API stays server-mediated: the bell refreshes + marks-read via
  server actions, the settings panel saves via a server action (no browser→API cross-origin auth).

## Post-go-live wave C follow-up — Widget UX fixes (2026-06-12)

- **D57 — Widget locale: the merchant's dashboard locale is authoritative; the host page's `<html lang>`
  is only a fallback. The result CTA actually navigates (new tab).** Two staging bugs drove this. (1) An
  Italian storefront (`<html lang="it">`) rendered the widget in Italian even though the merchant's
  configured locale was English: `app.ts` had folded the page `lang` into the *local* config, which by
  design wins over the remote (merchant) config. Fixed by passing `<html lang>` as a **third
  `pageLocale` fallback** to `mergeConfig`, so precedence is now explicit `data-lumina-locale`/`init` →
  **merchant (remote)** → page `lang` → `en`. A merchant can still force a per-install locale via the
  data-attr; nobody's storefront language silently overrides their dashboard choice. The e2e store page
  is now `lang="it"` on purpose to lock this in. (2) The **result CTA emitted `cta:click` but never
  opened the configured `urlTemplate`** — clicking "Add to cart" did nothing. `ctaClick()` now
  interpolates `{productId}`/`{productUrl}`, resolves the template against the page URL, and opens it via
  an injectable `navigate` (default `window.open(url, '_blank')`) — **new tab**, so the shopper keeps
  their generated room/result while the cart updates server-side. Merchants wanting custom (AJAX)
  handling still listen to `cta:click`.
- **D58 — Confirm-step custom instructions are expanded by default; the modal sets up its focus trap
  once.** The instructions field was a collapsed `<details>` (low discoverability) and, worse, every
  keystroke re-rendered the App with a fresh `onClose` arrow, which re-ran `Modal`'s focus effect and
  bounced focus back to the dialog — so each typed character dropped focus. Fix: the field is now an
  always-visible labelled `<textarea>`, and `Modal` reads the latest `onClose` from a ref so its
  focus-trap/`el.focus()` effect runs **once on mount** (`[]` deps) instead of on every render. The
  generating step now also sets the "this usually takes 1–2 minutes" expectation, and a feedback vote
  swaps the 👍/👎 for a "Thanks for the feedback!" confirmation. Focus-retention is verified in the real
  browser (Playwright `pressSequentially` + `toBeFocused`), not jsdom, since Preact defers `useEffect`.

## Post-go-live wave D — AI suggested quantity (2026-06-13)

- **D59 — Coverage quantity (#7) is a separate, cheap text+vision pass behind the orchestrator, gated to
  coverage categories, persisted only when confident, and never able to fail a generation.** A new
  `AIOrchestrator.estimateQuantity()` sits beside `compose()` (HARD RULE #8 — one entrypoint, one-file
  provider swap). Category gating lives in `packages/ai/quantity.ts`: only `tiles`, `decor`, `renovation`
  and `outdoor` are **coverage** products (you buy N to cover a surface); every other category
  short-circuits to quantity **1 with no model call** (the "shower/wardrobe = 1" rule — saves cost +
  latency). Coverage products hit `GatewayQuantityProvider`, a `generateObject` (Zod-schema) call through
  the Vercel AI Gateway on a cheap analysis model (`GATEWAY_MODEL_QUANTITY`, default
  `google/gemini-2.5-flash`); the raw number is clamped to `[1, 999]`. The model needs the product's real
  size, so `ProductSnapshot` gained an optional `dimensions` (populated from the product/inline product at
  create time — a JSONB shape change, no migration). The workflow runs the estimate **after** the composite
  is stored, wrapped best-effort: any error/low confidence (`< 0.5`) / single-unit just leaves the columns
  null — a flaky vision call can never fail an otherwise-good (already-billed-or-refunded) generation.
  Persisted as nullable `generations.suggested_quantity` + `quantity_rationale` (migration 0008) and
  surfaced on `StatusResponse`. The widget shows the estimate + a quantity **stepper** (seeded from the
  suggestion) only for coverage products; the chosen quantity interpolates into a new `{quantity}` CTA
  token (e.g. `/?add-to-cart={productId}&quantity={quantity}`) alongside `{productId}`/`{productUrl}`.

## Post-go-live wave E — Studio + clients (2026-06-13)

- **D60 — Studio (#8) is an authenticated, in-dashboard generation flow that reuses the entire widget
  pipeline; clients are a lightweight contact list, not a CRM.** The physical-store use case (a shop
  assistant renders "in your room" for a walk-in) ships as one `/studio` route. The new
  **`POST /v1/generations`** (session-auth, `requireMerchant`) calls the *same* `createGeneration`
  service + Inngest workflow as the widget — atomic `debit_credits` before enqueue, same refund-on-fail
  guarantee — so a Studio render costs one credit and behaves identically (HARD RULE #3 intact). It
  references the product by **internal uuid** (works for catalog items without an external SKU; a new
  `productUuid` branch in `resolveProduct`) and tags `metadata.source='studio'`. The room photo uses a
  new authed **`POST /v1/uploads/sign`** (mirrors the widget's `sign-upload` but behind a merchant
  session; key stays `{merchant_id}/`), and the browser PUTs straight to R2. **Clients** (`clients`
  table, migration 0009) carry name + optional email/phone/notes, RLS-scoped by `current_merchant_ids()`
  exactly like products; `generations.client_id` is a nullable FK **ON DELETE SET NULL** so deleting a
  client keeps their renders on file. Idempotency is untouched — each Studio upload gets a random
  `roomKey`, so same-product re-renders never collide. A linked `clientId` is verified to belong to the
  merchant before linking (the privileged API role bypasses RLS, so the check is explicit — HARD RULE
  #1). **Email** (`POST /v1/generations/:id/email`) sends the client a **7-day signed R2 link** to the
  result through the existing Resend `EmailSender` (no-op when unconfigured); recipient is an explicit
  address or the linked client's email. The dashboard stays server-mediated: a `/studio` server
  component seeds clients + active products, and a client `StudioView` drives upload → product →
  (optional) client → generate → poll → before/after (reusing the generations `BeforeAfter`) → email /
  download, all through `'use server'` actions in `lib/studio-actions.ts`. Workspaces/invites (#2/#3)
  remain deferred.

- **D61 — Studio (#8) grows from a single wizard into a navigable section: Overview · New · Clients ·
  client detail.** The one-shot `/studio` form was unusable for a real store, so Studio becomes a small
  route group under one sidebar item (`activeNavKey` already highlights `/studio/*`): `/studio` (a
  concise overview — stats + recent renders + recent clients), `/studio/new` (the wizard, now reading
  `?client=<id>` to preselect), `/studio/clients` (a searchable **rubric** with render count + last
  activity), and `/studio/clients/[id]` (editable contact/notes + that client's render history). No new
  migration — the `clients` table and `generations.client_id` (0009) already exist. Two small,
  backward-compatible data extensions power it: `GenerationSummary` gains a nullable `clientId`, and
  `listGenerations` gains `clientId` + `source` filters (`source='studio'` ⇒ `metadata->>'source'`,
  since Studio rows carry `metadata.source='studio'` and no `anonId` — widget rows always have one).
  Client activity comes from `listClientsWithStats` (a LEFT JOIN giving count + `max(createdAt)`, served
  by `GET /v1/clients?withStats=true`), and a new `GET /v1/clients/:id` backs the detail page — all
  merchant-scoped (HARD RULE #1). The UI reuses the design system end-to-end (the generations
  `gen-card` grid + `BeforeAfter` + `GenerationDetailModal`, `.table`/`.drawer`/`.avatar` primitives),
  so the change is mostly composition, not new visual primitives.

- **D62 — Generation quality v2: a single editable master prompt + a pixel-perfect composite, all on the
  AI Gateway.** The single full-frame Gemini edit rotated/re-framed scenes, guessed scale, and only worked
  for known categories. Five changes fix this: **(1)** prompts move to one editable surface
  `packages/ai/src/prompts/` — a structured **master prompt** (`system.ts`: objective→inputs→ANALYZE→hard
  rules→output) where the model **infers the product's placement archetype itself** (open-ended; the
  category is a soft hint, not a switch) — reliable for any product, no "unsupported category" cliff.
  **(2)** Interior **and exterior** scenes (facades/gardens) are first-class: prompt language generalized
  to "environment", moderation accepts a valid interior *or* exterior (`sceneScore`, reason
  `not_environment`), HARD RULE #9 reworded. **(3)** The compose call pins the **output aspect ratio to the
  uploaded room** + `imageSize 2K` via `providerOptions.google.imageConfig`, and feeds the product's real
  dimensions — killing re-frame/rotation and scale guesswork. **(4)** **Pixel-perfect by construction:**
  rather than trust the model to "keep the rest," we diff its render against the original
  (`images/diff-mask.ts`), then composite only the changed region (product + shadows) back over the
  original (`images/composite.ts`, an explicit raw per-pixel blend) — every pixel outside the product is
  byte-identical to the upload; a too-small/large change falls back to the full render. `sharp` (server-only)
  added for these pixel ops. **(5)** We **rejected FLUX.1 Fill** (and any mask-native inpainter): it is
  text-only and can't reproduce the merchant's *exact* product, so Gemini stays the reference-aware
  compositor and our composite enforces fidelity — keeping everything on the **one Gateway** (D49) with no
  new platform; the dormant `fal` provider + `@fal-ai/client` dep were removed. Change-detection knobs
  (`CHANGE_MASK_*`) are env-tunable from real renders.

## Generation Engine v2 (2026-06-16) — see `docs/lumina/generation-engine-v2-plan.md`

- **Phase 0 — eval harness expanded for robustness regression.** `scoreEval` now reports `byInputClass`
  (success/latency/cost/👍 per input difficulty class) beside `byCategory`, and `EvalCaseResult` carries an
  optional `inputClass` (absent ⇒ `standard`). The golden set
  (`apps/api/scripts/eval-golden.json`, surfaced via `eval-run.ts`) gained non-standard cases —
  `tilted`, `ambiguous`, `dark`, `blurry`, `exterior`, `messy-product` — so every later phase can prove it
  helps hard inputs **without regressing** the standard ones. The golden URLs are placeholders and the 👍
  rate is a human rating: the **real baseline + the Axiom latency split are owner-run** (need Gateway image
  credits + real assets) and are tracked in `docs/lumina/generation-engine-v2-eval.md`.

- **D63 — Product background removal wired (matting cutout, cached per product).** Non-studio product
  photos (busy/hand-held/on-shelf) produced distorted composites because the model had to infer the
  product silhouette from a noisy reference. Fix: a clean cutout via the existing `BgRemovalProvider` seam
  (reused, not a new interface — `AIOrchestrator.bgRemoval`, one-file swap per HARD RULE #8), defaulting to
  a **Replicate matting** model (`ReplicateMattingProvider`, env `BG_REMOVAL_PROVIDER`/`BG_REMOVAL_MODEL`/
  `REPLICATE_API_TOKEN`, called via the Replicate HTTP API with `Prefer: wait`, injectable runner so the
  provider logic is unit-tested offline). **A matting model preserves the original product pixels** (it
  returns a cutout under an alpha matte, it does NOT re-render) — a generative "remove background" was
  rejected because it re-paints the product and risks altering identity/branding. The cutout is cached on
  `products.clean_image_key` (column already existed — no migration): the generation workflow resolves the
  product image as **cached cutout → compute-and-cache (catalog products) / compute-per-gen (inline) →
  raw image**, all **best-effort** (any failure or no provider configured degrades to the raw product
  image; a cutout failure never fails or bills a generation). New R2 objects keep the `{merchant_id}/`
  prefix. Offline e2e stays green via `MockBgRemovalProvider` (a fidelity-preserving no-op).
  **Deferred (intentionally, lazy guard makes them non-essential):** the eager `product.image.process`
  Inngest pre-compute on product create/bulk (an optimization to remove first-generation latency) and the
  Gemini-edit bg-removal implementation behind the same seam (a secondary fidelity A/B vs matting).
  `sharp`-based matte erosion/feather is left to a later refinement to keep `packages/ai` free of a native
  `sharp` dependency (sharp stays confined to `apps/api/src/lib/images`).

- **D64 — Scene-analysis vision pass wired into compose.** The single-shot compositor degraded on noisy
  rooms because it had to infer geometry/lighting/scale from the raw image. Fix: a `SceneProvider`
  (`GatewaySceneProvider`, a `generateObject` call on the cheap flash model — `SCENE_MODEL`, defaulting to
  `GATEWAY_MODEL_QUANTITY`, on the same `AI_GATEWAY_API_KEY`, no new credential) returning a per-image
  `SceneAnalysis` validated by a **shared Zod schema** (`@lumina/shared`, HARD RULE #6): interior/exterior,
  lighting direction/intensity/temperature, surface map, signed tilt estimate, room scale, a free-text
  placement region, quality flags (blurry/dark/cluttered) and a confidence. It runs **in parallel** with
  the product cutout (`Promise.all`) and feeds `ComposeInput.scene`; `compose.ts` renders the facts
  (lighting, surfaces, scale × product dimensions, placement region, exterior note via `isExterior`) and
  **drops a low-confidence analysis** (< 0.35) so an unsure read is never worse than none. The pass is
  **best-effort**: a missing provider, an error, or low confidence falls back to the prior compose
  behaviour and never fails or bills a generation. This is **per-image understanding, NOT a category
  taxonomy** — the merchant category stays a soft hint only; tilt/quality/scale are consumed by later
  phases (3 deskew, 4 escalation). Offline e2e stays green via a neutral `MockSceneProvider`.

- **D65 — Room normalization (deskew + conditional auto-level) before compose.** Tilted/dark rooms
  produced distorted composites, and the pixel-perfect composite fell back to the (re-framed) full render
  when the model "corrected" the framing. Fix: normalize the room server-side with `sharp`
  (`apps/api/src/lib/images/normalize.ts`) **before** compose — a gentle deskew using
  `SceneAnalysis.tiltDegrees` (Phase 2), **clamped to ±`DESKEW_MAX_DEGREES`** (default 8) and **cropped to
  the largest inscribed rectangle of the original aspect** so the rotation leaves no wedge borders, plus a
  **conditional auto-level** (`sharp.normalize()`) only when the scene flags the photo dark
  (`AUTOLEVEL_ENABLED`, default true). The transform math is pure, unit-tested helpers (`resolveDeskewAngle`
  clamp, `inscribedRect` crop, `shouldAutoLevel` gate); `sharp` stays **lazily loaded** so a native miss
  degrades to the un-normalized room. The normalized room is **stored back at the room key** and becomes
  the baseline for both the **aspect-ratio pin** and the **pixel-perfect blend**, so the returned image may
  be slightly straightened vs the raw upload (intended — it still depicts the user's room and looks
  better). **Best-effort**: a level photo, a missing scene, or a sharp failure returns the room unchanged —
  normalization never fails or bills a generation. Deskew is intentionally gentle to avoid an uncanny
  perspective warp.

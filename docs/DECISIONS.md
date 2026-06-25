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
  **Eager pre-compute (now implemented):** a `product.image.process` Inngest function computes + caches the
  cutout on product **create / bulk upsert** (tenant-scoped, idempotent — skips when `clean_image_key` is
  set, best-effort so it never blocks a product write), so the first generation isn't slowed by it; the
  lazy guard remains the backstop. **Endpoint correctness (verified on Replicate):** a non-official matting
  model (BiRefNet et al.) is **not** runnable via the `/v1/models/{owner}/{name}/predictions` endpoint —
  that is official-models-only — so the provider routes a **version-pinned** ref (`owner/name:version` or a
  bare version id) through `/v1/predictions` with `Prefer: wait` (`buildMattingRequest`). Verified model:
  `men1scus/birefnet` (6.2M runs, input field `image`); env `BG_REMOVAL_INPUT_KEY` covers models with a
  different field. **Vercel-consolidated path added (`BG_REMOVAL_PROVIDER=gateway`, now recommended):**
  research confirmed **no matting/segmentation model exists on the Vercel AI Gateway** (it exposes only
  generative image models — FLUX, Imagen, Gemini) and Vercel has no native bg-removal. So the one-service
  option is a **generative cutout** via the Gateway (`GatewayBgRemovalProvider`, Gemini "Nano Banana"
  isolates the product on white, reusing `AI_GATEWAY_API_KEY` — no extra service/credential/billing). It
  **re-renders** the product (lower fidelity than matting, no true alpha), but the cutout is only a
  **reference** — the compositor re-renders the product into the room anyway (the pixel-perfect step
  preserves the room, not the product), so a Gateway cutout is "one extra generative step on the reference",
  not "destroyed pixels". Replicate matting is **kept as the higher-fidelity optional alternative** behind
  the same seam (one-env-var swap, #8); which wins on real products is an eval question. A true-alpha
  (chromakey + sharp) gateway variant and `sharp` matte erosion/feather are left to later to keep
  `packages/ai` free of a native `sharp` dependency (sharp stays confined to `apps/api/src/lib/images`).

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

- **D66 — Layout-guided REFINE compose for coverage products (Phase 5).** **(See D67 for the production
  history: this REFINE design is correct and is what ships; it was briefly disabled while sharp was broken
  on Vercel, then restored once sharp loaded.)** A real generation of a 60×60
  acoustic wall panel produced **one crooked panel** instead of covering the wall. Three compounding gaps:
  the coverage estimate was UI-only (never reached compose), the master prompt actively said *"AVOID
  duplicated product"*, and from-scratch full-frame compose is unreliable at tiling. Fix: when the coverage
  estimator returns a **confident multi-unit** estimate, build a programmatic **layout guide** —
  `apps/api/src/lib/images/layout.ts` tiles the product's cached cutout in a regular grid across the scene's
  target surface (`scene.suggestedPlacement.bbox`, else a default wall box) on top of the **normalized**
  room — and compose in a **REFINE pass** (`packages/ai/src/prompts/refine.ts`, selected by
  `buildComposePrompt` when `ComposeInput.layout` is set; the gateway sends `[layout, product]`). REFINE
  keeps the laid-out placement/unit-count/coverage, **aligns** the tiles (parallel edges, correct
  perspective — fixes the "crooked" output), preserves product identity, never touches the room/framing,
  and **deliberately allows repetition** (the from-scratch dedup rule is dropped). The pixel-perfect step is
  coverage-aware (`COVERAGE_CHANGE_MAX_FRACTION`, default 0.95) since a tiled wall is a legitimately large
  change. **Scope:** coverage products only this milestone — single-object placements keep the prior direct
  compose to avoid regressing what already works; single-object layout-guidance is a later extension. Stays
  on the existing model + key (D49), no new provider. **Best-effort throughout**: no cached cutout, an
  unreadable room, or any failure falls back to a normal compose and never fails or re-bills a generation.
  Final quality is gated on a real-image re-test / the eval golden set, not a unit assertion.

- **D67 — Coverage = deterministic GUIDE + generative REFINE, with the guide as fallback (Phase 5; corrects
  the saga below).** **Production history (2026-06-17):** a long debugging arc on the acoustic-panel case
  saw "rotated room / single crooked panel / room repainted / null result dims". The real root cause was
  **`sharp` failing to load on the Vercel Inngest function** (`ERR_DLOPEN_FAILED: libvips-cpp.so` — a pnpm
  file-tracing miss; the addon resolves libvips via a sibling symlink whose `.so` wasn't packaged at the
  RUNPATH path). Because every `sharp` call is wrapped in try/catch, the failure was **silent**: auto-orient
  no-op'd (rooms stayed rotated), the coverage guide never built (so compose ran **from-scratch with no
  guide** → a single panel), and `readImageSize` returned 0 (null dims). A mid-saga decision to "retire
  REFINE and ship the deterministic composite" was made on that **false premise** — REFINE had never
  actually been given a real guide. Once sharp loaded, the deterministic composite worked but, shipped raw,
  looked like a flat cut-and-paste ("made in Paint"); refining that guide generatively, in turn, produced
  worse, distorted walls. **Final decision (owner call, 2026-06-17):** stop putting N product copies in the
  image entirely. Coverage products generate exactly like every other product — **one from-scratch AI
  compose** (no layout guide, no tiling) → pixel-perfect blend over the normalized room — which is the clean,
  photorealistic result merchants expect; the image is *illustrative*. The coverage **quantity** ("you need
  ~N units to cover this surface") stays valuable but is now purely **informational**: it is still estimated
  pre-compose (`estimateQuantity`, gemini-2.5-flash) and stored on the generation (`suggested_quantity` /
  `quantity_rationale`), exposed on `GenerationDetail`, and surfaced in the dashboard Studio result — it
  never influences how the image is generated. **Removed from the workflow:** `buildCoverageLayout`
  usage, `resolveCoverageCount`, `LAYOUT_COMPOSITE_MODEL`, and `COVERAGE_CHANGE_MAX_FRACTION` (the
  `layout.ts` / `refine.ts` / `ComposeInput.layout` modules remain in the tree, dormant, if image-tiling is
  ever revisited). **Sharp robustness (kept — this was the real production fix):** the libvips `.so` is
  force-included at the addon's symlink path via `outputFileTracingIncludes`, and `GET /internal/sharp-check`
  verifies sharp loads on Vercel without a billed generation; this is what unblocked auto-orient (correct
  orientation), normalization, and the pixel-perfect composite for *all* products.

## Generation Engine v3 — Planner-driven compose (2026-06-18) — see `docs/lumina/generation-engine-v3-brief.md`

- **Phase 0 finding (recorded for Phase 2).** The Phase 0 de-risk spike + a captured eval baseline (7 real
  cases, owner-confirmed 👍 7/7) showed the image model (Nano Banana Pro) **can** re-surface a wall with a
  repeating product in correct perspective via prompting alone — **no homography/perspective-warp fallback
  needed** — but only when **told to cover** (an explicit "cover/tile the wall" hint). The brief's "single
  crooked panel" failure is therefore the model not *deciding* to cover when unprompted, NOT an inability to
  cover. So the planner's value is operation **inference**; Phase 2's mode-specific compose must drive
  covering from `plan.mode` (not a hint) and tighten the covering prompt to change ONLY the target surface
  (the spike's covering prompt over-altered the rest of the scene). `sharp` was re-verified alive on staging
  (`GET /internal/sharp-check` → `{ok:true}`) and the 90° portrait-rotation fix re-confirmed on the §3.1 case.

- **D68 — Planner-driven compose (Phase 1).** Added the missing reasoning step. A single cheap
  `gemini-2.5-flash` **planner** (`GatewayPlannerProvider`, `generateObject` + the shared
  `GenerationPlanSchema` in `packages/shared`) reasons over **BOTH images + product metadata** and returns a
  structured `GenerationPlan`: the operation **`mode`** (`surface_covering` | `object_replacement` |
  `object_placement`), `target` (description + optional bbox — a plain number array, never a `z.tuple`, which
  Gemini's `response_schema` rejects), `repetition` (kind + `estimatedCount` clamped to [1,999] via a
  transform so a wild number never fails the parse), `scale`, per-image `sceneFacts` (reusing the scene
  sub-schemas), and `confidence`. **`mode` is an *operation* inferred per image, NOT a product-category
  taxonomy** — the scalable constraint the owner requires. It **evolves and replaces the separate
  scene-analysis pass (one call, not two)**: the dead scene stack (`SceneProvider`, `GatewaySceneProvider`,
  `prompts/scene.ts`, `MockSceneProvider`, `orchestrator.analyzeScene`, `selectSceneProvider`) is removed;
  `planToSceneAnalysis` adapts the plan's facts into the `SceneAnalysis` the (unchanged-this-phase)
  compositor already consumes, so compose behaviour is preserved while the new mode/target/repetition fields
  wait for Phase 2. **Best-effort:** no provider / an error / no result falls back to a neutral
  zero-confidence `object_placement` plan (`neutralGenerationPlan`), so the planner never fails or bills a
  generation (HARD RULE #3). Env `PLANNER_MODEL` (legacy alias `SCENE_MODEL`), defaulting to
  `GATEWAY_MODEL_QUANTITY`; reuses `AI_GATEWAY_API_KEY` (no new credential, HARD RULE #8). **Eval gate (real
  Gateway, 7-case golden set):** the planner classified all 7 cases correctly — the 5 lamp cases
  `object_placement`, both coverage cases (slatted acoustic panel + discrete tile) `surface_covering`; 7/7
  success, no visual regression vs the Phase 0 baseline (avg latency 43.5s → 46.5s — the +3s planner call,
  addressed in Phase 3).

- **D69 — Mode-specific compose, the covering correction (Phase 2).** The compositor's task is now assembled
  **per operation**, layered on the always-true `COMPOSE_SYSTEM_INSTRUCTION`, selected by `plan.mode`
  (`buildComposePrompt` → `buildCoveringTask` | `buildReplacementTask` | `buildComposeTask`):
  - **`surface_covering`** is rendered as **generative re-surfacing** — the product treated as a *repeating
    unit* clad over the target surface in perspective, explicitly rejecting BOTH deterministic tiling (the v2
    "paste N copies" that produced raw pasted panels) AND single-object placement. A scoped exception lets it
    cover the target surface while keeping everything else (and the framing/aspect ratio) byte-exact.
  - **`object_replacement`** swaps an existing element matching its position/scale/perspective; **`object_placement`**
    is the prior single-placement behaviour (the default when no mode).
  - `mode`/`target`/`repetition` are plumbed `GenerationPlan → ComposeInput → prompt`.
  - **Mode-dependent cutout (§4.3):** object modes use the cached cutout (matting recommended for fidelity,
    behind the existing `BG_REMOVAL_PROVIDER` seam); `surface_covering` **skips the cutout** and passes the
    original product texture (the model needs the repeating pattern).
  - **Mode-aware pixel-perfect composite (§4.4):** object modes keep the localized diff-mask blend over the
    original; `surface_covering` accepts the **full render** + the aspect-ratio pin (the target surface
    changes by design). Explicit, mode-driven branch.
  - **Dead tiling code removed** (superseded): `images/layout.ts` (+ test), `prompts/refine.ts` (+ test),
    `ComposeInput.layout`, the gateway `[layout, product]` branch, and the refine switch in `prompt.ts`.
  - **Eval gate (real Gateway, the 2 coverage cases run with NO placement hint):** the planner inferred
    `surface_covering` from the product image and the mode-specific compose **clad the wall autonomously** —
    `coverage-slats-wall` → a wood-slat clad wall, `coverage-discrete-tile` → a tiled wall, both in correct
    perspective, portrait preserved, **not rotated, not a single panel, not raw pasted copies** (the §3.1
    success criterion). 7/7 success, no visual regression on the 5 placement cases; avg latency ~40s
    (Phase 3 target). The earlier failure was never an inability to cover — it was the model not *deciding*
    to cover when unprompted; the planner + mode-specific compose supplies that decision.

- **D70 — Difficulty-aware routing: fast common path, quality on escalation (Phase 3).** The common path now
  defaults to the **fast** image model at **1K**; it escalates to the **quality** model at **2K** when the
  planner flags a difficult scene (`sceneFacts.quality` blurry/dark/cluttered, or a low-confidence plan) and
  for the top plan tiers. Free stays fast (watermarked, cost-controlled). `resolvePolicy(merchantPlan, plan)`
  + `resolveImageSizes(env)` are pure, unit-tested helpers in `packages/ai/src/routing.ts`; the orchestrator
  keeps the fast→quality fallback chain so an escalation is a starting point, not a guarantee. Per-policy
  resolution is env-tunable (`GATEWAY_IMAGE_SIZE` = 2K quality, `GATEWAY_IMAGE_SIZE_FAST` = 1K fast). The
  workflow also **parallelizes the independent post-plan pre-passes** (the mode-dependent cutout ‖ room
  normalization). **Latency regression undone:** the Inngest route `maxDuration` is brought back **300s → 120s**
  (`apps/api/vercel.json`) now that the silent-`sharp` retries and redundant passes are gone — the owner should
  confirm p50/p95 in Axiom on real traffic. **Eval gate (real Gateway):** routing behaved exactly as designed —
  the 5 easy cases (standard/tilted/exterior + both coverage) ran on the fast model at 1K (~12–14s, 6¢), the 2
  genuinely-hard cases (dark, blurry) escalated to quality at 2K (~40s, 13¢). **Avg latency 43.5s → 21.3s
  (−51%), avg cost 13¢ → 8¢; the common path is ~13s (p50 < 15s, fast-case p95 < 30s — target met).** No quality
  regression: at 1K on the fast model the placements still read correctly AND both coverage cases still rendered
  a clad / tiled wall (the §3.1 criterion holds on the fast path).

## Multi-product generation (2026-06-22) — Studio

- **D71 — Multiple products stored as a snapshot array, not a junction table.** A generation can now compose
  several products into one image (Studio). The set is an immutable **snapshot** captured at generation time
  (the catalog FK is `on delete set null`, so live FKs would lose history), is never queried relationally, and
  is small. So we added a nullable `generations.product_snapshots jsonb` (`0010_*.sql`, additive — no backfill,
  no RLS change) instead of a junction table (which would add a migration + RLS + N inserts inside the credit
  transaction + joins per read). `product_id` / `product_snapshot` stay as the **primary** (first) product, so
  every existing single-product read is byte-identical; single-product rows leave `product_snapshots` null.
  Each snapshot also carries the catalog `id` (not an FK) so the workflow caches the per-product bg cutout.

- **D72 — One combined render = one credit (unchanged debit/refund).** A multi-product generation produces one
  output image, so it debits exactly one credit like any generation — no per-product billing. `productIds` is
  capped at **5** (each product is an extra reference image; quality/latency degrade past a handful). The
  idempotency key folds the **ordered** product refs into one string (`refs.join(',')`), so a single product
  hashes identically to before (cache preserved) and product order stays significant.

- **D73 — Multi-product forces `object_placement` + a multi-object prompt; localized-change guard loosened.**
  The planner's `surface_covering`/`object_replacement` operations are single-object by construction, so a
  multi set forces `object_placement` (the planner still runs for scene facts). A new `buildMultiPlacementTask`
  enumerates each product (name/category/dimensions) and forbids merging/duplicating/omitting; the gateway
  sends `[room, ...productCutouts]`. The diff-mask composite-over-original still applies, but
  `CHANGE_MAX_FRACTION_MULTI` (0.85, vs 0.6) lets several objects change more of the scene before it bails to
  the full render. Coverage-quantity estimation is skipped for a multi set (a single-product concept).

## Draw on the room photo (2026-06-22) — Studio + widget

- **D74 — Draw-on-room via a burned annotation, not provider inpainting.** The active Gemini-via-Gateway
  provider only takes `images + prompt` (no mask input), so the shopper's freehand strokes are **burned onto
  a copy** of the room (sharp rasterizes an SVG polyline overlay, `apps/api/src/lib/images/annotate.ts`) and
  that annotated image is fed to the model, with a prompt line referencing the exact color and telling the
  model the marks are guidance to **remove**, not render. The clean room stays the before image and the
  diff-mask composite base, so stray marks outside the placed region are discarded automatically; residual
  marks inside it are the one accepted risk (mitigated by low alpha + the prompt). Strokes travel as
  **normalized 0..1 vectors** in the request (no second upload — the server rasterizes at native res) and are
  persisted in `generations.metadata.annotation` (**no schema column**). Marks use the surface's accent color
  at 0.6 alpha — never red. The annotation line is shared by the single- and multi-product prompts.

- **D75 — Annotation folds into the idempotency key only when present.** Un-annotated requests keep their
  existing keys (the segment is appended only when an annotation exists); a re-draw is a distinct paid render.

- **D76 — The widget draws inside ConfirmStep, not a new flow step.** Overlaying the canvas on the existing
  room preview avoids a new state-machine step and is leaner for the <45 KB bundle (**37.7 KB after, ~+1.5 KB**;
  no drawing library — a few canvas calls + pointer events reused from `BeforeAfter`). The pure stroke helpers
  `buildAnnotation`/`normalizedPoint` live in `@lumina/shared`, shared by the Studio (`RoomAnnotator`) and the
  widget (`DrawCanvas`). The stroke color resolves from the merchant accent (`theme.accent`), falling back to
  the brand `#5a55d6` when it isn't a usable `#rrggbb`.

- **D77 — The change mask diffs against the room the model SAW (burned), not the clean room.** *(Superseded by
  D80 — the burned diff punched holes through a product placed over its own marks; D80 reverts to a clean diff.)*
  D74's "self-cleaning" relied on the diff-mask comparing the model output to the clean room — but that only erases
  strokes the model *itself* removed; strokes the model **retained** (e.g. a broadly-marked wall where only
  part got the product) differ from the clean room, so the mask flagged them "changed" and the composite
  **kept the marked pixels** (observed: a highlighted wall's marks survived into the result). Fix: in
  `keepOnlyProductChange` the change mask is now computed against `diffReference` — the exact bytes handed to
  the model (clean room **+** burned strokes) — while kept pixels are still restored from the *clean* original.
  Any region the model left untouched (including leftover strokes) now reads as "unchanged" → clean, mark-free
  pixels are restored over it. This makes **highlight removal deterministic** (model-independent), and because
  the strokes no longer count as "changes" the `CHANGE_MAX_FRACTION` bail triggers less often on annotated
  renders. With no annotation `diffReference` is omitted (equals the clean room), so the single-product path is
  byte-identical. The compose annotation line also now says a broad marked area indicates the **extent** to
  fill/cover (not a single point), to nudge coverage-style products to fill the highlighted region.

- **D78 — The marked position is authoritative, reinforced by a resolved textual region.** The drawn location
  was being ignored for objects (a lamp drawn on the right was placed centrally on both Studio and widget):
  the burned mark is faint and the object-placement task said "place at the most natural, functional location",
  which the model satisfied by centering. Fix in two layers: (1) prompt authority — when an annotation is
  present, `buildComposeTask`'s primary instruction targets the marked location (not "most natural"), and
  `annotationFact` states the marked position OVERRIDES the natural location and (multi) match each product to
  its best-fit marked region; (2) a deterministic textual region — `annotationRegionLabel()` (`@lumina/shared`)
  reduces the strokes' bounding-box centre to a coarse 3×3 label ("right", "top-left", …) that the workflow
  passes as `ComposeInput.annotation.region` for a **single** product, so the prompt states an explicit
  position ("the marked area is on the right — place it there") the model obeys far more reliably than a faint
  mark. The region is omitted for multi-product (no per-product stroke mapping); precise multi positions rely
  on the strengthened prompt + the visual marks, and remain model-dependent (the provider takes only
  images + prompt, so there is no deterministic per-object placement lever).

- **D79 — A morphological close fills the stroke-line holes the burned-diff punches through a product.**
  *(Superseded by D80 — the close ran large-sigma blurs + PNG round-trips on every annotated render, pushing the
  function past its 120s timeout, and its aggressive dilate/erode blotched the lighting. D80 drops it.)* D77's
  diff-against-burned classifies any pixel where the model output ≈ the burned reference as "unchanged" → clean
  restored. Where the user draws a product's shape and the model places the product over those strokes, the
  product's pixels occasionally fall within the threshold of the burned (room+stroke) color, so the diff
  punched **holes along the stroke lines** (missing pieces) and rendered the glow blotchy — off-stroke the
  product was solid, confirming it was confined to the drawn marks. Fix: on the annotated path only,
  `computeChangeMask` now takes a `close` radius and applies a morphological close (dilate→erode) to the binary
  mask before feathering — filling small holes *surrounded by changed (product) pixels* while leaving large
  unchanged regions (a retained mark on an empty wall) black, so D77's mark removal still holds. The radius is
  scaled to the burned stroke width (~width/3, clamped 3–30px) and passed via `keepOnlyProductChange`; the
  non-annotated path passes no `close` and is byte-identical. Implementation note: `blur` and `threshold` must
  live in **separate** sharp pipelines — within one pipeline sharp runs `threshold` before `blur` regardless of
  chain order, which would no-op the threshold on a binary mask.

- **D80 — Mark removal is a cheap stroke-region keep-threshold, not a burned diff or morphology.** *(Superseded
  by D81 — any stroke-region special-casing damages a product placed on its own marks; the keep-threshold
  dropped the lamp's mid-contrast pixels and glow, reproducing the holes + blotchy lighting once D78 made the
  product land on its strokes.)* D77+D79
  regressed badly: every annotated render diffed against the burned room (punching holes through a product
  placed over its own marks) and ran a morphological close (large-sigma blurs + ~6 full-res PNG round-trips),
  which on the Inngest runtime pushed past the **120s function timeout** (→ `FUNCTION_INVOCATION_TIMEOUT`,
  retries, 3–4 min total) and blotched the lighting. Reverted both. The change mask is again a plain diff
  against the **clean** room (smooth product + glow, fast — this is the known-good pre-D77 behaviour). Retained
  marks are removed cheaply instead: `computeChangeMask` takes the burned room as `markReference`; a pixel the
  burn shifted (a stroke pixel) must clear a **higher** keep threshold (`CHANGE_STROKE_KEEP`, default 140) to be
  kept — a translucent leftover mark shifts a pixel ~100 so it's dropped (restored to the clean room), while a
  real product shifts it ≫140 so it stays solid (no holes). Cost: one extra image decode, no blur/morphology, so
  generation latency returns to the previous 10–50s. Trade-off: a very low-contrast product placed exactly on a
  stroke could lose a soft edge; acceptable vs the timeout/blotch. With no annotation `markReference` is omitted
  and the path is byte-identical. The position fix (D78) is unaffected.

- **D81 — The composite is annotation-agnostic; stroke removal is the prompt's job, not the composite's.** The
  key realization after D77→D80 all failed: once D78 makes the product land on the drawn strokes, the stroke
  region **is** the product region, so *any* special-casing of that region in the composite (a burned diff, a
  morphological close, or a stroke-region keep-threshold) damages the product — holes + blotchy lighting. D80
  proved this again (its threshold dropped the lamp's mid-contrast pixels and glow). Resolution: revert all of
  it. `keepOnlyProductChange` / `computeChangeMask` do a **plain diff against the clean room** — the model
  output is kept where it differs from the upload (product + shadows + glow, smooth) and the original is
  restored elsewhere — exactly the pre-F3 behaviour, fast, no holes. The burned strokes remain guidance for the
  **model only** (still sent to compose for placement, D78); **removing them is left to the prompt** (which
  already states emphatically "do NOT render/keep the marks"), never to the composite. Consequence: a mark the
  model declines to remove in an area with no product can survive — accepted, because the alternative
  (mutating the product region) is worse. If that recurs we'll address it without ever touching product pixels.

- **D82 — Full revert of the annotation positioning + removal work (D77–D81) to the F3 baseline; redesign from
  scratch.** Even after D81 the owner still saw missing product pixels + strange lighting + a surviving mark.
  Five successive fixes (D77–D81) failed to make burned-stroke placement/removal robust — the signal that the
  whole sub-approach, not its parameters, is wrong. Reverted `compose.ts` (annotationFact/buildComposeTask/
  buildMultiPlacementTask), `types.ts` (`annotation` back to `{ color }`), `@lumina/shared` annotation (dropped
  `annotationRegionLabel`), and the workflow's compose wiring to the **D74/de3f958 F3 baseline** — the state
  where the lamp rendered fine. F1 (CSV dims), F2 (multi-product), the widget draw-stage CSS fix, and the rest
  of F3 (the draw UI + the burn-onto-the-room-for-the-model mechanism) are **kept**. Positioning-where-drawn and
  deterministic stroke-removal are now **open for a fresh design** (see the next spec) — likely candidates: a
  provider/model with real mask-inpainting support, or a textual-region placement hint that does NOT alter the
  composited pixels, decided with the owner before any implementation.

- **D83 — Draw-to-place (region_edit) = fal Seedream v4.5/edit full-frame + drift safety-net (Option A).** After
  a spike on the owner's real golden cases (`apps/api/scripts/spike-fal/`, throwaway), the rebuild was decided on
  evidence, not parameters. **Model:** `fal-ai/bytedance/seedream/v4.5/edit` behind `AIProvider` — faithful
  product reconstruction (even from a partial product photo), ~$0.04, ~30s. **Rejected:** Nano-Banana-Pro on fal
  (too slow, 143–225s); `flux-kontext-lora/inpaint` for objects (it frames the reference photo as a mounted
  picture — only ok for flat surfaces); **region-gated diff-mask composite (reintroduces the D77–D81 "missing
  pieces / burnt" bug** — thin low-contrast object parts fall below the change threshold and get composited away);
  crop-to-region (burnt, out-of-context lighting). **Strokes are never burned** — the widget already sends them as
  vectors; we derive the drawn REGION (`regionFromStrokes`) and a generic geometry-derived `placementPhrase`, edit
  the CLEAN room full-frame with ONE generic rule block (`buildRegionEditTask` — works for any product/any room,
  no per-category if/else), and **contain drift only when needed**: `driftOutsideRegion` > `REGION_DRIFT_MAX`
  (0.06) ⇒ `containInRegion` (keep the model's region, restore the original elsewhere), else ship the raw
  full-frame (best quality — "room recognizably yours", owner-accepted, not byte-identical). **Additive:** routes
  via `regionChain` (FAL_KEY ⇒ `[fal, gateway]`, else `[gateway]`); non-drawn modes + multi-product drawn keep
  today's gateway path untouched (multi-product stroke→product auto-mapping is deferred to M-R5). Plan:
  `docs/superpowers/plans/2026-06-23-draw-to-place-region-edit.md`. Owner-set: Phase-2 (migrate non-drawn modes to
  Seedream) is approved but gated on the upgraded golden eval staying ≥ baseline 7/7.

- **D84 — Roll back the whole draw-to-place feature; restore the proven 7/7 engine + add fal as an equivalent
  cross-provider fallback.** The draw-on-room feature (`de3f958`→`d7caa84`: F3 + the D83 fal region_edit) never
  reached acceptable quality, and because the widget Confirm step *invites* drawing, drawn generations routed
  through the broken region path → the app was unusable in practice. Decision (owner, 2026-06-23): stop iterating
  on draw and make the **core generation engine** excellent first. Restored every draw-modified file to the last
  proven-good state **`5ef528e`** (the Gen-v3 engine that scored **7/7 👍** on the golden set —
  standard/tilted/dark/blurry/exterior/coverage, ~43s, owner-confirmed) and deleted the draw-only files
  (`images/region.ts`+`annotate.ts`, shared `annotation.ts`+`region.ts`, `DrawCanvas`/`RoomAnnotator`, the
  `spike-fal/` scripts, and their tests). **Kept:** F1 (CSV dimensions), F2 (multi-product), and
  `packages/ai/src/providers/fal.ts`. No Supabase change — the annotation only ever rode in `generations.metadata`
  JSONB (no column/migration). **Provider strategy:** Gemini (`gemini-3-pro-image`) remains the proven primary;
  **fal Seedream is appended to every compose chain as the cross-provider fallback** (`selectFalFallback` +
  `buildComposeChains`, FAL_KEY-gated) running the SAME compose prompt and the SAME `keepOnlyProductChange`
  composite, so quality/speed are equivalent whichever provider serves and a full gateway outage never hard-fails
  a generation. **Supersedes D83.** Next: push the engine beyond 7/7 and validate via the golden eval through BOTH
  providers; drawing may return later only as an isolated strategy behind the eval gate. Definitive goal: env
  (room/house/garden/person) + 1+ products → faithful product, environment untouched where nothing is added,
  < 1 min, robust to imperfect (non-straight / non-4K) inputs.

- **D85 — Drop fal entirely; Gemini is the only compose provider.** With fal wired as a fallback (D84) the
  golden eval was run through BOTH providers (Gemini vs fal Seedream v4.5) on all 7 cases. **Gemini won
  decisively on quality AND speed.** fal consistently mis-behaved: it relit/brightened scenes (tilted, dark),
  de-blurred/altered the scene (blurry), floated objects or opened doors (standard lamp), and tiled coverage
  products as discrete blocks — i.e. it broke requirement (a) "don't change the environment". It was also
  slower (avg ~41s vs Gemini ~27s, with a 62s outlier over the 1-minute budget). The product-description
  anchor (D-next) helped Gemini broadly but only partially helped fal and even regressed its slat covering.
  **Decision (owner, 2026-06-23): fal results are terrible — remove it completely and use only Gemini.**
  Reverted `factory.ts` + `index.ts` to the Gemini-only chains, deleted `providers/fal.ts`, `fal.test.ts`,
  and the fal-only `factory.test.ts`, and dropped the `COMPOSE_PRIMARY`/`selectFalFallback`/`buildComposeChains`
  experiment. **Models in use (Vercel AI Gateway):** quality = `google/gemini-3-pro-image` (**Nano Banana
  Pro**), fast = `google/gemini-3.1-flash-image-preview`; the router picks fast for easy scenes and escalates
  to Nano Banana Pro for hard ones. The `FAL_KEY` on Vercel/`.env.dev` is now unused (owner can remove it).
  Supersedes the fal-fallback half of D84.

- **D86 — Multi-product generations are pinned to the FAST tier.** Validating the multi-product panels fix on
  the owner's real bedroom (lamp + acoustic slat panels), the quality model (`gemini-3-pro-image`, Nano Banana
  Pro) took **69–133s** on the multi set (room + 2 product images) — over the **<1 min hard requirement** — with
  **no visible quality gain** over the fast tier (`gemini-3.1-flash-image-preview`), which produced an equally
  good result (panels cladding the whole wall, lamp at realistic scale, room preserved) in **~18s at half the
  cost**. A multi-object compose inherently sends more input images, so it's structurally the slowest path;
  single-product keeps the adaptive routing (`resolvePolicy`: fast common, escalate to quality on difficult
  scenes — measured 38–49s, within budget). Change: `workflow.ts` composes multi with `policy: 'fast'`
  unconditionally (`isMulti ? 'fast' : resolvePolicy(...)`). Decided autonomously per the owner's standing
  "own the technical how + prove with visual evidence" + "<1 min" mandates.

## Relievum — fashion / person path (2026-06-24)

- **D87 — Fashion ("wear/hold the product on a person") is an isolated path keyed solely on
  `category === 'fashion'`.** New client Relievum (3D-printed handbags) needs the shopper's own selfie +
  the bag composited into their hand. The furniture/environment path must not regress (the #1 constraint),
  so the wearable path is gated entirely behind one predicate `isFashionCategory()` (`packages/ai/src/fashion.ts`):
  every fashion branch has an `else` that is the unchanged environment behaviour, and no existing string or
  function is rewritten in place. **What the fashion branch does, and nothing else:** (1) a separate master
  prompt `COMPOSE_SYSTEM_INSTRUCTION_FASHION` — the upload is a *person/SUBJECT*, not a room; preserve face/
  hair/body/pose/hands/clothing/background pixel-for-pixel and *add ONLY the accessory*; scale to the hand/
  forearm (never a door/room); fingers occlude the handle; soft contact shadow on the body. (2) a new
  `accessory_placement` task that **never** calls `sceneFacts()`/`EXTERIOR_NOTE` (no interior/exterior
  anchoring leaks into a portrait). (3) a separate owner-editable `FASHION_GENERATION_RULES` playbook (the
  furniture scale rules — floor-lamp heights, door references — must not appear in a person prompt). (4) the
  workflow **skips the furniture-oriented planner + coverage** for fashion (a planner would mis-read a selfie
  as a room) and forces `mode='accessory_placement'`; this also makes `normalizeRoom` a no-op (no deskew on a
  selfie) and shaves one flash call. **Moderation is already compatible** — `FACE_OK_CATEGORIES = {'fashion'}`
  already lets selfies (low scene-score, face-dominant) pass; no moderation change. **Why fast tier
  (`resolvePolicyFashion`, default fast; `FASHION_QUALITY_TIER` env to force quality):** the pixel-perfect
  composite keeps only the changed region (bag + its contact shadow) over the ORIGINAL upload, so the
  quality-sensitive region — the shopper's face — is **never model-rendered** (a quality + privacy guarantee:
  the output face is provably the user's real face), de-risking the fast model; `CHANGE_MAX_FRACTION_FASHION`
  (≈0.5) keeps the mask path engaged for a normal placement while a pathological full repaint still bails out.
  **Activation requirement:** Relievum's products must be `category='fashion'` or none of this engages.
  Furniture prompts are **snapshot-locked** (`packages/ai/test/prompt-fashion.test.ts`) as a regression
  tripwire. **Not yet validated on a real generation** — gated on the owner's eval (credits constraint).

- **D88 — Generic, merchant-configurable pre-upload guide (NOT fashion-specific).** A new optional widget
  step shown BEFORE upload, fully owner-configurable so any merchant/category can use it (a tiles shop:
  "frame the wall like this"; Relievum: "hold the bag like this"). Stored as a `guide` jsonb on
  `widget_configs` (`{ enabled, imageUrl, title?, body? }`, migration `0011`); a new `WidgetGuideSchema` in
  `packages/shared/src/widget.ts` feeds both the settings PUT and the public `GET /v1/widget/config` (the
  route only surfaces it when `enabled && imageUrl`). **No domain/"pose" wording anywhere in code** — the
  copy is verbatim merchant text; only the CTA button is localized (`guide.cta`, 5 locales). **Image is a
  plain hosted URL** (same pattern as product `imageUrl`), NOT an R2 upload — chosen to match the existing
  product-image pattern and avoid presign/public-bucket complexity; **R2 file-upload-for-guide is backlogged**
  (`docs/lumina/relievum-project/pricing-backlog.md` / future). **Rendered as a pure view-layer gate in
  `App.tsx`** (a one-time overlay before the upload step, reset on close) — deliberately NO reducer/controller
  changes, so the existing upload→confirm→generate flow and its tests are untouched. Shown in the live widget
  and the dashboard preview (new conditional "Guide" tab), **never in the Studio** (it doesn't render the
  widget step tree). Widget bundle after the change: **36.7 KB gzip (< 45 KB)**. Decoupled from the engine:
  the guide passes nothing to generation; the fashion behaviour (D87) keys only on `category==='fashion'`.

- **D89 — New EUR pricing (Starter/Growth/Pro/Enterprise) + free trial, no card.** Encoded the cofounder's
  public pricing page into `PLAN_CATALOG`/`PLAN_PRESENTATION` (`packages/shared/src/plans.ts`): Starter
  €149/300 viz · Growth €349/1,000 (highlighted) · **Pro €699/3,000 (new tier)** · Enterprise from
  €1,499/10,000. Credits = "visualizations". **`pro` added to the `plan_tier` enum via a non-destructive
  `ALTER TYPE … ADD VALUE` (migration `0012`)** — appended last in `PLAN_TIERS` so the migration is append-only;
  display/price ranking is now an **explicit** map in the dashboard `planRank` (not the enum storage order).
  **`scale` retired** (no longer sold) but kept in the enum + catalog so legacy subs still resolve and the PG
  enum value isn't removed. New `SELLABLE_PLAN_TIERS = [starter, growth, pro, enterprise]` drives the billing
  cards (`buildBillingPlans` no longer iterates all tiers); `free`/`scale` are never shown. Currency switched
  to **€** (`formatPrice`). **Free trial, no card, all plans:** checkout sets `payment_method_collection:
  'if_required'` + `subscription_data.trial_period_days` (env `TRIAL_PERIOD_DAYS`, default 14; Relievum uses
  30) + `trial_settings.end_behavior.missing_payment_method: 'cancel'`. Stripe products/prices + env
  (`STRIPE_PRICE_PRO` etc.) are an **owner task** (live account, HARD RULE #10) — commands + the enforced-vs-
  backlog limit breakdown (overage €0.49, multi-shop caps, feature gates — all NOT implemented) are in
  `docs/lumina/relievum-project/pricing-backlog.md`.

- **D90 — Guide image: paste a link OR upload (served via a public proxy, bucket stays private).** The
  pre-upload guide (D88) accepted only a hosted URL; merchants without a host pasted a Google-Drive *view*
  link, which is an HTML page (not image bytes) so `<img>` never loads. Added an upload option that keeps the
  paste-a-link option (both write `guide.imageUrl`). Flow mirrors the Studio room upload: `POST
  /v1/uploads/guide` presigns an R2 PUT under `guides/{merchant_id}/` (HARD RULE #1; only PNG/JPEG/WebP) and
  the browser PUTs straight to R2. **The R2 bucket is private (D50 — room photos are people's homes), so the
  guide image — a deliberately published, shopper-facing asset — can't use a signed/expiring URL.** It is
  served by a new public proxy `GET /v1/widget/guide/{merchantId}/{id}.{ext}` that streams the object with
  `Cache-Control: public, max-age=31536000, immutable` (the id is random → content never changes). The sign
  route returns that stable `publicUrl` to store in the widget config; the widget/config assembly and the
  `WidgetGuide` schema are unchanged (still just a URL string). No new env (the proxy origin is derived from
  the request). Defense-in-depth: the proxy validates `merchantId`/`id` are UUIDs and re-checks the key's
  tenant via `merchantIdForKey` before reading.

- **D91 — Tiered, row-preserving data retention (TODO #2).** Keeping every uploaded room photo + result in R2
  forever doesn't scale, but the old retention cron deleted the whole `generations` row after 90 days, so the
  dashboard lost its history entirely. New model: on success the pipeline stores a small **long-lived WebP
  thumbnail** of the result (`thumb_key`, ~512px, best-effort — never fails a generation) plus a `thumb`
  asset row. The cron (`purgeExpiredAssets`, replacing `purgeGenerationsOlderThan`) now deletes only the
  **heavy R2 originals** — room uploads past `RETENTION_ROOM_DAYS` (default **30**, a privacy win since rooms
  are people's homes) and results past `RETENTION_RESULT_DAYS` (default **90**) — and flags the row
  (`room_purged_at` / `originals_purged_at`); the **row, its metadata and the thumbnail survive** so the
  gallery + analytics history stay intact. Idempotent + batched. Reads gate `roomUrl`/`resultUrl` on the
  flags, always serve `thumbUrl`, and expose `originalsPurged`; the gallery falls back to the thumbnail and
  the detail view shows a retention note. GDPR `purgeMerchant` also wipes `thumbs/`. Migration `0013`.
  `RETENTION_DAYS` (legacy single window) still honored as the result-window fallback.

- **D92 — Real per-generation cost from the AI Gateway, not a fixed estimate (TODO #6).** `cost_cents` used to
  be a fixed per-tier env guess (13¢/6¢). The Vercel AI Gateway returns the **real** cost of every request at
  `result.providerMetadata.gateway.cost` (USD), so the gateway runner now captures it live
  (`parseGatewayCostMicros`) and stores it precisely in **`cost_micros`** (USD millionths — sub-cent calls
  round to 0 in `cost_cents`); `cost_cents` is derived from it for the existing UI, and the env `costCents`
  stays only as the fallback when the gateway didn't report a cost (mock/BYOK/offline). Migration `0014`.
  `costSummary()` aggregates real cost per model for internal margin (gate any endpoint to the `support` role
  — it reveals OUR cost, never a regular merchant). **Scope:** only the dominant **compose** call's real cost
  is captured today; the auxiliary flash passes (planner/quantity) and Replicate bg-removal are sub-cent and
  remain a documented follow-up (not yet summed). **Credit model decision:** keep **1 credit = 1 generation**
  toward the customer (predictable); use the real cost only for internal margin/accounting. The infra for a
  variable debit already exists (`debit_credits(merchant, amount, gen)` takes an amount), so switching to
  per-model credits later is a one-call change. **Plan re-pricing** awaits the owner's target-margin decision
  on real blended-cost data (no price numbers changed here).

- **D93 — Account billing model: shops + a shared credit pool (TODO #4/#5, follow-up).** The dashboard's
  pricing promises "N shops per plan" (Starter/Growth 1, Pro 3, Enterprise ∞) and the owner confirmed credits
  should be **shared** across an owner's workspaces — but the app billed every workspace independently (its own
  `plan` + `credits_balance`, no shop cap). We introduce an **`accounts`** table (`owner_user_id` unique →
  `auth.users`, `plan`, shared `credits_balance`) that owns one or more workspaces via `merchants.account_id`;
  only **billing + credits** move to the account, while products/generations/widget/RLS stay merchant-scoped so
  HARD RULE #1 (tenant isolation by `merchant_id`) is untouched. Delivered in **three phases** so nothing breaks
  mid-flight: **(1)** table + `account_id` + backfill + shop cap on create (this commit); **(2)** move the credit
  pool (grant/debit/read/ledger + balance) to the account; **(3)** move the Stripe subscription/customer to the
  account + dashboard billing UI (shared credits, "X of N shops"). **Backfill (migration `0016`):** one account
  per owner, `plan` = the **highest** plan among their workspaces (never downgrade a payer), `credits_balance` =
  the **SUM** of their workspaces' balances (lose no credits); `account_id` nullable for now (tightened to NOT
  NULL once every row is migrated). Shop cap = `PLAN_CATALOG[plan].maxShops` (`shopLimit()`), enforced in
  `createWorkspace`; over-limit returns `403 shop_limit`. The backfill casts `plan::text` in its ranking CASE so
  it never references an `ALTER TYPE ADD VALUE` label (e.g. `pro`) in the same transaction.

- **D94 — Account model phases 2–3: shared credits + Stripe/billing on the account.** *Credits (Phase 2,
  migration `0017`):* `credit_ledger.account_id` (backfilled); `debit_credits`/`grant_credits` keep their
  signatures but resolve merchant→account and move `accounts.credits_balance`, writing an account-scoped
  ledger row (`merchant_id` retained for attribution + existing RLS). **Dual-mode:** when a merchant isn't
  linked to an account they fall back to the merchant's own balance — defensive in prod and keeps the many
  tests that insert bare merchants green. `/credits`, `/me` and new-workspace creation report the shared
  `accounts` balance + plan, so switching workspace shows the same pooled credits (fixes #5). *Stripe/billing
  (Phase 3):* the webhook (`applyBillingEvent`) also sets `accounts.plan` (the account is the billing entity —
  its plan drives the shop cap + every dashboard read); `grant_credits` already pools onto the account.
  `/billing/plans` reads `accounts.plan`; the billing page shows "X of N shops · shared". **Follow-up (not
  done):** the `subscriptions` table is still keyed by `merchant_id`; a full re-key to one-subscription-per-
  account is deferred. Interim safeguard: checkout refuses to create a second real subscription when the
  account already has one (`stripeSubscriptionId NOT NULL` on any of its shops) and points to the portal, so
  there's no duplicate/double-charged subscription. `merchants.plan`/`credits_balance` columns remain but are
  now vestigial (read paths use the account); drop in a later cleanup once verified in prod.

- **D95 — Plan downgrade: deactivate (not delete) over-limit workspaces (follow-up to D93/D94).** Upgrades/
  switches for an existing subscriber go straight to the Stripe **billing portal**; a **downgrade** opens a
  first-party modal (lost-benefits warning from `lostFeatures()`), and when the target plan allows fewer
  shops than the account currently has active, the owner picks which to KEEP — the rest are **reversibly
  deactivated** (`merchants.suspended_at`, migration 0018), NOT deleted (owner's call: no data loss, no
  destroyed storefronts). A suspended workspace doesn't count against the shop cap (`createWorkspace` counts
  active only), can't be the active workspace (auth + dashboard resolvers skip it), and its public widget +
  secret API are off; it's reactivated from the sidebar when back under the cap. The change runs through
  **POST /v1/billing/change** (account-owner only): **Stripe first** (`subscriptions.update` to the lower
  price, `proration_behavior:'none'` = no refund, change at renewal — owner's call), then suspend the
  non-kept shops in an advisory-locked txn that refuses to leave 0 active; `accounts.plan` stays
  webhook-owned. The only sellable shop-reducing transition is pro/scale (3) → starter/growth (1).
  **Process note:** designed + adversarially vetted via two multi-agent workflows (design caught blockers
  pre-code: never delete the subscription-bearing shop, derive keep-count from `shopLimit` not a hardcode,
  per-account serialization; impl review confirmed 8 minor issues, all fixed). **Open follow-ups:** the
  `subscriptions` table is still merchant-keyed (D94 re-key pending); the portal route has no backend
  owner-check (frontend-gated only); downgrade-to-free is rejected by /billing/change (cancel via portal).

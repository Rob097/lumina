# LUMINA — Complete Technical Specification

**Document type:** canonical reference for the LUMINA application.
**Basis:** the actual codebase at the time of writing — not the original design doc. Where the shipped
system diverges from the original architecture, this document describes **what is actually built** and
flags anything that is a seam/planned-but-not-wired.

**Companion documents in the repo:**
- `LUMINA_Technical_Architecture.md` — the original v1.0 design (some parts have since evolved).
- `docs/DECISIONS.md` — the engineering decisions log (D1–D62), the authority for *why* things changed.
- `CLAUDE.md` — always-true guardrails (hard rules).
- Per-package READMEs: `apps/{api,dashboard,widget}/README.md`, `packages/ai/src/prompts/README.md`,
  `infra/README.md`.

---

## Table of contents

1. Product overview — what it is, who it's for, business model
2. System architecture — planes, components, trust boundaries, multi-tenancy
3. Technology stack & languages (exact versions)
4. Repository layout (monorepo)
5. Data model — enums, tables, RLS, SQL functions, migrations
6. Shared contracts (Zod) & error envelope
7. API reference — every route
8. AI pipeline — orchestrator, models, prompts, moderation, quantity, pixel-perfect composite
9. The durable generation workflow (Inngest) & failure handling
10. End-to-end flows
11. The widget
12. The merchant dashboard
13. Billing & credits
14. Notifications
15. Security, privacy, GDPR
16. Observability
17. Third-party services
18. Infrastructure & deployment
19. Environment variables reference
20. Testing strategy
21. Implementation status & divergences from the original spec

---

## 1. Product overview

### 1.1 What LUMINA is

LUMINA is a multi-tenant **"Visual Commerce" SaaS**. It adds a **"Try in your room"** capability to any
product: a shopper (online) or a shop assistant (in-store) uploads a photo of a real **environment** — an
**interior** (a room) **or an exterior** (a facade, an entrance, a garden) — and an AI pipeline composites
the **exact** product into that photo. The result is intended to look like an unedited photograph of the
customer's own environment containing the real, purchasable product, with correct placement, real-world
scale, lighting, contact shadows, perspective, and (for coverage products) a suggested quantity.

A merchant integrates LUMINA by pasting **one line of `<script>`** on their storefront — there is no
platform-specific plugin. Products can be pre-registered (catalog) or passed inline at trigger time.

### 1.2 The four surfaces

1. **Widget** — the embeddable client that runs on the merchant's storefront (Preact, Shadow DOM, < 45 KB
   gzipped), delivered as a 2-file loader from a CDN.
2. **Public widget API** — keyed, origin-checked HTTP endpoints the widget calls.
3. **Merchant dashboard** — the authenticated control plane (catalog, widget config, analytics, billing,
   notifications, and the in-dashboard **Studio** flow with a client address book).
4. **Durable AI workflow** — the Inngest pipeline that runs the queued, retryable, credit-metered
   generation.

### 1.3 Who it's for

- **Online merchants** — furniture, lighting, doors/windows, kitchen/bath, tiles/renovation, decor,
  outdoor, mirrors, etc. (the supported product categories — see §5.1).
- **Physical stores / showrooms** — via **Studio**: a shop assistant renders "try in your room" for a
  walk-in customer, optionally saving the render against a **client** record and emailing it.

### 1.4 Business model — credits

Credit-based. A merchant is on a **plan tier** (`free`, `starter`, `growth`, `scale`, `enterprise`); each
plan grants a monthly **included-credits** allotment (Stripe-driven). **Each generation costs 1 credit**,
debited **atomically before** the job is enqueued. **A failed generation is never billed** — terminal
failures auto-refund the credit. An identical re-request (same merchant + product + room + hint + custom
instructions) returns the cached result for **0 credits**.

Plan catalog (`packages/shared/src/plans.ts`) — monthly included credits and published list prices
(list prices are display-only; the real charge is the Stripe price resolved from env):

| Tier | Included credits / mo | List price (USD/mo) |
|---|---|---|
| free | 10 | 0 |
| starter | 250 | 49 |
| growth | 1,200 | 199 (highlighted) |
| scale | 6,000 | 799 |
| enterprise | 25,000 | custom |

---

## 2. System architecture

### 2.1 The five planes

1. **Widget plane** — the embeddable client on the merchant's site.
2. **Edge/API plane** — the public widget API + the authenticated merchant API (one Next.js app on Vercel).
3. **AI plane** — the durable, queued image-generation workflow (Inngest) + the `AIOrchestrator` library.
4. **Data plane** — Postgres (Supabase), object storage (Cloudflare R2), Redis (Upstash).
5. **Control plane** — the dashboard, billing (Stripe), observability (Axiom; Sentry planned).

### 2.2 Component map (as actually deployed)

```
   Shopper browser (merchant storefront)
     loader widget.js  ──▶  widget.[hash].js   (Preact app in a Shadow DOM)
        │ HTTPS (site_key, Origin-checked)
        ▼
   @lumina/api  (Next.js 15 route handlers on Vercel)
     • /api/v1/widget/*   (public, publishable key + CORS/Origin)
     • /api/v1/*          (merchant, Supabase session)
     • /internal/inngest  (Inngest serve endpoint + retention cron)
        │ enqueue                    │ read/write
        ▼                            ▼
   Inngest Cloud  ──HTTP──▶  /internal/inngest    Supabase Postgres (+ RLS, Auth, Realtime publication)
     generation.requested workflow
        │ compose (AIOrchestrator)            Cloudflare R2  (rooms/ products/ results/, merchant-prefixed)
        ▼                                     Upstash Redis  (rate limit · idempotency · anon caps · cache)
   Vercel AI Gateway  ──▶ Google image models (Nano Banana Pro / Flash Image)

   Cross-cutting:  Stripe (billing) · Resend (email) · Axiom (events/telemetry) · Sentry (planned)
   Dashboard:  @lumina/dashboard (Next.js 15 on Vercel) ──HTTP(session cookie)──▶ @lumina/api
```

### 2.3 Trust boundaries & multi-tenancy

- **Tenant = merchant.** Every business row carries `merchant_id`. Isolation is enforced at three layers:
  1. **Application** — every query is scoped by the `merchant_id` resolved from the authenticated context.
  2. **Postgres Row-Level Security** — on the dashboard path (Supabase Auth JWT → `current_merchant_ids()`).
  3. **Object-storage key prefixing** — every R2 key is `{root}/{merchant_id}/…`, so signed URLs cannot
     cross tenants.
- **Two auth domains:**
  - *Widget → public API*: a **publishable `site_key`** (`pk_test_…` / `pk_live_…`), bound to an
    **allowed-domains** list; the server validates the key **and** the `Origin` (CORS is limited to those
    domains). No user login.
  - *Dashboard / merchant API*: a **Supabase Auth session** (JWT in a cookie). Server-to-server uses a
    **secret key** (`sk_…`).
- **The widget never holds secrets** — it only ever sees a `site_key`, presigned upload URLs, and a
  `generationId`.
- The **public widget API runs with the service role** (it does not use end-user JWTs); it scopes every
  query by the `merchant_id` resolved from the validated `site_key`. RLS is the safety net for the
  dashboard path and any client-side Supabase access.

---

## 3. Technology stack & languages

### 3.1 Languages

- **TypeScript (strict)** — everywhere (apps + packages). No `any` (use `unknown` + Zod).
- **SQL (PostgreSQL / plpgsql)** — schema via Drizzle; hand-authored migrations for RLS, grants, and
  functions (`debit_credits`, `grant_credits`, `current_merchant_ids`).
- **CSS** — the dashboard design system (ported verbatim into `packages/ui`), plus the widget's
  Shadow-DOM-scoped styles.
- **HTML/JS** — the widget loader and the e2e/test storefront harnesses.
- **Runtime:** Node 20.19.0 (pinned via `.nvmrc`, `engines`, `packageManager`); package manager pnpm
  9.15.4.

### 3.2 Exact dependency versions (from each `package.json`)

| Workspace | Key dependencies |
|---|---|
| `apps/api` | `next ^15.1.3`, `react ^19`, `drizzle-orm ^0.38.3`, `@aws-sdk/client-s3 ^3.713`, `@aws-sdk/s3-request-presigner ^3.713`, `@supabase/ssr ^0.5.2`, `@supabase/supabase-js ^2.47`, `@upstash/ratelimit ^2.0.5`, `@upstash/redis ^1.34.3`, `inngest ^3.27` (installed 3.54), `sharp ^0.35.1`, `stripe ^17.4`, `zod ^3.24.1` |
| `apps/dashboard` | `next ^15.1.3`, `react ^19`, `recharts ^2.15`, `@supabase/ssr`, `@supabase/supabase-js`, `@lumina/ui`, `@lumina/widget` (preview lib), `zod` |
| `apps/widget` | `preact ^10.25.4`, `@lumina/shared` (no `zod` dependency — uses a structural `Parser<T>` to stay lean) |
| `packages/ai` | `ai ^6.0.198`, `@ai-sdk/gateway ^3.0.126`, `zod`, `@lumina/shared` |
| `packages/db` | `drizzle-orm ^0.38.3`, `postgres ^3.4.5` (postgres.js driver), `@lumina/shared` |
| `packages/shared` | `zod ^3.24.1` |
| `packages/ui` | none (ships CSS only) |

### 3.3 Tooling

- **Monorepo:** Turborepo (`turbo.json`) + pnpm workspaces (`pnpm-workspace.yaml`). Task graph:
  `build`, `build:next`, `build:bundle`, `dev`, `lint`, `typecheck`, `test`, `db:{generate,migrate,seed}`.
  `^build` dependencies make packages build before their consumers; `globalPassThroughEnv` carries the
  widget's `PUBLIC_*` build vars.
- **Quality gates:** ESLint (flat config `eslint.config.mjs`), Prettier, `tsc --noEmit` typecheck,
  Vitest (unit + Testcontainers integration), Playwright (widget e2e). Husky pre-commit runs the full
  lint + typecheck across the repo.
- **Build outputs:** packages build with `tsup` (ESM+CJS+d.ts); the dashboard/api build with `next build`
  (`build:next`); the widget builds with a custom `build.mjs` (two-stage loader + hashed app bundle).

### 3.4 Root scripts (`package.json`)

```
pnpm dev            # turbo run dev (all apps)
pnpm build          # turbo run build
pnpm lint           # turbo run lint
pnpm typecheck      # turbo run typecheck
pnpm test           # turbo run test (vitest; Docker needed for DB integration tests)
pnpm format         # prettier --write .
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # drizzle-kit migrate
pnpm db:seed        # seed demo merchant + keys + products
```

---

## 4. Repository layout (monorepo)

```
lumina/
├─ apps/
│  ├─ api/         # Next.js 15 route handlers: public widget API + merchant API + Inngest serve
│  ├─ dashboard/   # Next.js 15 App Router merchant control plane
│  └─ widget/      # Preact + Vite → 2-file loader (widget.js + widget.[hash].js)
├─ packages/
│  ├─ shared/      # Zod schemas, types, enums, constants — the cross-cutting contract
│  ├─ db/          # Drizzle schema, migrations (0000–0009), RLS/functions, seed, Testcontainers harness
│  ├─ ai/          # AIOrchestrator, providers (gateway/mock/vertex/replicate stubs), prompts, moderation
│  └─ ui/          # the design system (tokens/components/app CSS) → @lumina/ui/styles.css
├─ infra/          # IaC notes + Cloudflare worker/wrangler + Vercel notes (provisioning is via CLIs)
├─ docs/           # DECISIONS.md, deploy.md, setup.md, release-checklist.md, design/, lumina/
├─ turbo.json · pnpm-workspace.yaml · tsconfig.base.json · eslint.config.mjs
```

The four `packages/*` are the shared foundation; the three `apps/*` consume them. Types flow **DB → API →
widget** through `@lumina/shared` so the three planes never drift.

---

## 5. Data model

**Engine:** PostgreSQL (Supabase). **Schema & queries:** Drizzle ORM (`packages/db/src/schema.ts`),
driver `postgres.js`. **Primary keys:** `uuid` (`gen_random_uuid()`). **Timestamps:** `timestamptz`.
**Isolation:** `merchant_id` on every business table + RLS on the dashboard path. Enum value tuples are
imported from `@lumina/shared` so DB/API/widget share one source of truth.

### 5.1 Enums (`packages/shared/src/enums.ts`)

- `product_category`: `furniture, lighting, door, window, kitchen, bath, shower, tiles, mirror, decor,
  renovation, outdoor, fashion, other`.
- `generation_status`: `queued, processing, succeeded, failed, refunded`.
- `key_kind`: `publishable, secret`. `key_env`: `test, live`.
- `member_role`: `owner, admin, member`.
- `ledger_reason`: `purchase, grant, generation, refund, adjustment, expiry`.
- `plan_tier`: `free, starter, growth, scale, enterprise`.
- Notification types (text, not a PG enum): `generation_failed, low_credits, payment_failed`;
  channels `in_app, email`.
- Widget locales: `it, en, de, fr, es` (default `en`).

### 5.2 Tables (15)

**Tenancy**
- **`merchants`** — `id, name, slug (unique), plan, credits_balance` (denormalized cache of the ledger
  sum), `allowed_domains text[]`, `settings jsonb`, timestamps.
- **`memberships`** — `(merchant_id, user_id)` unique; `role`. `user_id` → `auth.users(id)` (the FK is
  added in the hand-authored migration, since `auth` is Supabase-managed).

**Access**
- **`api_keys`** — `kind, env, prefix` (unique, for lookup/display), `key_hash` (`sha256(raw)`),
  `site_key` (the raw publishable key, kept readable because it ships in the storefront `<script>`; null
  for secret keys), `last_used_at, revoked_at`.

**Catalog & widget**
- **`products`** — `external_id` (merchant SKU; `(merchant_id, external_id)` unique), `name, category,
  image_url, clean_image_key, dimensions jsonb, attributes jsonb, active` (soft-delete).
- **`widget_configs`** — one **active** row per merchant (partial unique index `widget_active_uidx`);
  `button_text, locale, theme jsonb, i18n jsonb, result_cta jsonb, watermark`.

**Studio (#8)**
- **`clients`** — a merchant's lightweight contact list: `name, email?, phone?, notes?`; RLS-scoped like
  products.

**Generation (the core fact table)**
- **`generations`** — inputs: `room_key, product_snapshot jsonb` (name/category/imageUrl/dimensions,
  inline-safe so it survives product deletion), `placement_hint, custom_instructions, client_id`
  (Studio; `ON DELETE SET NULL`), `idempotency_key`. Outputs: `result_key, model, suggested_quantity,
  quantity_rationale`. Accounting/ops: `credits_spent, cost_cents, latency_ms, error_code, anon_id,
  page_url, metadata jsonb, status, created_at, finished_at`. Indexes: `(merchant_id, created_at desc)`,
  `(status)`, unique `(merchant_id, idempotency_key)`, `(product_id)`.
- **`generation_assets`** — `role` (`room|product|result|intermediate`), `storage_key, width, height,
  bytes`.

**Credits & billing**
- **`credit_ledger`** — append-only; `amount` (+grant/+purchase/+refund, −generation), `reason,
  generation_id, stripe_ref, note`. Balance == `SUM(amount)` (mirrored in `merchants.credits_balance`).
- **`subscriptions`** — one row per merchant: `stripe_customer_id, stripe_subscription_id, plan, status,
  included_credits, overage_meter, current_period_end`.
- **`webhooks_inbox`** — `id` = provider event id (idempotency), `source, payload, processed_at`.

**Ops / analytics**
- **`usage_events`** — `type` (`impression|open|upload|generate|success|cta|feedback`), `product_id,
  generation_id, anon_id, props jsonb`; index `(merchant_id, type, created_at desc)`.
- **`audit_log`** — `actor, action, target, meta`.

**Notifications**
- **`notifications`** — fan-out **one row per merchant member** (`user_id` → `auth.users`); `type, title,
  body, data jsonb, read_at`. In the Realtime publication.
- **`notification_prefs`** — PK `(merchant_id, user_id)`; `prefs jsonb` (per-type `{inApp,email}` toggles).

### 5.3 Row-Level Security & SQL functions

RLS is enabled on the dashboard-facing tables. Helper:

```sql
create function current_merchant_ids() returns setof uuid  -- SECURITY DEFINER, fixed search_path
  language sql stable as $$ select merchant_id from memberships where user_id = auth.uid() $$;
```

Tenant policies use `merchant_id in (select current_merchant_ids())`. `notifications` /
`notification_prefs` use a per-user policy (`user_id = auth.uid()`).

**Credit functions (atomic, race-safe):**
- `debit_credits(merchant, amount, gen)` — `UPDATE merchants SET credits_balance = … - amount WHERE id =
  merchant AND credits_balance >= amount` (returns null → raises `INSUFFICIENT_CREDITS`), then appends a
  `generation` ledger row. One transaction.
- `grant_credits(merchant, amount, reason, ref)` — the inverse: bumps the cache + appends a ledger row.
  **Not idempotent on its own** — callers guard refunds with a conditional status transition (see §9).

> **Lockdown (D46):** Supabase's project default privileges auto-grant `anon`/`authenticated` on every new
> `public` table. Migration `0004` `REVOKE`s those on the six server-only tables (`api_keys, audit_log,
> generation_assets, memberships, subscriptions, webhooks_inbox`) and enables deny-all RLS, and pins
> `search_path` on the credit functions. The table owner (`postgres`) and `service_role` bypass RLS, so
> the API/workflow are unaffected.

### 5.4 Migrations (`packages/db/drizzle/`, applied in journal order)

| # | File | Adds |
|---|---|---|
| 0000 | `noisy_ken_ellis` | all base tables/enums/indexes (drizzle-kit generated) |
| 0001 | `rls_functions` | RLS enable + policies + grants, the `auth.users` FK on `memberships`, `current_merchant_ids()`, `debit_credits()` (hand-authored) |
| 0002 | `grant_credits` | the `grant_credits()` function |
| 0003 | `realtime` | adds `generations` to the `supabase_realtime` publication |
| 0004 | `lockdown_server_tables` | the D46 lockdown (revoke + RLS + search_path) |
| 0005 | `last_redwing` | `api_keys.site_key` (readable publishable key for the install snippet) |
| 0006 | `motionless_black_widow` | `generations.custom_instructions` |
| 0007 | `closed_secret_warriors` | `notifications` + `notification_prefs` (+ FK/RLS/grants/publication appended) |
| 0008 | `wakeful_justice` | `generations.suggested_quantity` + `quantity_rationale` |
| 0009 | `faithful_nightcrawler` | `clients` table + `generations.client_id` |

Schema changes happen **only** through Drizzle migrations (`drizzle-kit generate` → `migrate`). No ad-hoc
SQL. The Supabase MCP is read-only (inspect schema/advisors only).

---

## 6. Shared contracts (Zod) & error envelope

`packages/shared` is the single contract reused by the API, the dashboard, and the widget. Each concern
has a module + tests: `config`, `generate`, `generation`, `product`, `client`, `widget`, `analytics`,
`credits`, `plans`, `account`, `notifications`, `events`, `enums`, `errors`.

- **Validation:** every API input and output is parsed by a Zod schema from `@lumina/shared`. The widget
  validates responses via a structural `Parser<T>` type (so it needs no direct `zod` dependency, keeping
  the bundle lean).
- **Error envelope (every public endpoint):**
  ```json
  { "error": { "code": "snake_case", "message": "…", "requestId": "…" } }
  ```
  with the correct HTTP status. Standard codes include: `invalid_key`, `domain_not_allowed`,
  `rate_limited`, `insufficient_credits`, `invalid_input`, `unsupported_image`, `generation_failed`,
  `not_found`, plus moderation codes (`not_environment`, `face_dominant`, `unsafe_content`,
  `unsafe_output`, `corrupt_image`).
- **Idempotency:** mutating endpoints accept an `Idempotency-Key` header; webhooks dedupe via
  `webhooks_inbox`.
- **Versioning:** URL-versioned under `/v1`.

---

## 7. API reference

All routes live in `apps/api/src/app/**/route.ts` (Next.js 15 App Router, **Node runtime**). Handlers are
thin wrappers over framework-agnostic, tested modules in `apps/api/src/lib`. There are **35 route files**.

### 7.1 Auth types

- **PUBLISHABLE** — `site_key` (`pk_…`) via the `X-Lumina-Key` header or `?site_key`; Origin-checked
  against the merchant's allowed domains; CORS limited to those domains. (`resolveByPublishableKey`)
- **SECRET** — `Authorization: Bearer sk_…` for server-to-server. (`resolveBySecretKey`)
- **SESSION** — Supabase Auth cookie via `@supabase/ssr`, used by the dashboard endpoints.

Keys are stored as `sha256(raw)` + a lookup `prefix`; the raw key is shown once on creation. Format:
`^(pk|sk)_(test|live)_<base64url-secret>$`; verification = prefix lookup + timing-safe hash compare +
revoked check.

### 7.2 Public widget API (PUBLISHABLE key + Origin/CORS)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/widget/config` | `{ enabled, theme, buttonText, locale, i18n, watermark, limits, resultCta }` |
| POST | `/api/v1/widget/sign-upload` | presigned R2 PUT → `{ uploadUrl, roomKey, expiresIn }` |
| POST | `/api/v1/widget/generate` | rate-limit + anon daily cap → idempotency check → cached result (0 credits) **or** atomic debit + enqueue; `201 { generationId, status:"queued" }` · `402 insufficient_credits` |
| GET | `/api/v1/widget/status/:id` | polling fallback → `{ id, status, stage?, resultUrl?, beforeUrl?, suggestedQuantity?, error? }` (signed R2 GET URLs) |
| POST | `/api/v1/widget/feedback` | 👍/👎 → `usage_event` (`204`) |
| POST | `/api/v1/widget/event` | impression/open/cta beacon → `usage_event` (`204`) |

### 7.3 Merchant / dashboard API (SESSION; some SECRET)

**Account & access**
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/healthz` | liveness |
| GET | `/api/v1/me` | current user + merchant memberships + role |
| POST | `/api/v1/auth/bootstrap` | idempotent first-login provisioning (creates merchant + default key pair) |
| GET / POST | `/api/v1/keys` | list / create (reveal-once) |
| DELETE | `/api/v1/keys/:id` | revoke (tenant-scoped) |
| GET / PUT | `/api/v1/domains` | allowed-domains list |
| PUT | `/api/v1/merchant` | rename; owner-only `DELETE` performs GDPR erasure (`purgeMerchant`) |
| GET | `/api/v1/team` | members (emails via a read-only `auth.users` reference) |

**Widget config & install**
| Method | Path | Notes |
|---|---|---|
| GET / PUT | `/api/v1/widget-config` | reads/upserts the merchant's single active `widget_configs` row (the same row the public config derives from) |

**Catalog**
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/v1/products` | list (search/category filter) / create |
| POST | `/api/v1/products/bulk` | upsert by `external_id` in a transaction → `{ created, updated }` |
| PUT / DELETE | `/api/v1/products/:id` | update / soft-delete (archive `active=false`) |

**Generations & analytics**
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/generations` | keyset pagination `(created_at,id)`; filters `status, clientId, source`; injected signed image URLs |
| GET | `/api/v1/generations/:id` | full detail + assets |
| GET | `/api/v1/analytics/summary` | merchant-scoped SQL aggregation over `usage_events` + `generations` |
| GET | `/api/v1/analytics/timeseries` | series for Recharts (`?range`, day/week interval) |

**Studio (#8)**
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/v1/clients` | list / create; `?withStats=true` adds render count + last activity |
| GET / PUT / DELETE | `/api/v1/clients/:id` | fetch / update / delete |
| POST | `/api/v1/uploads/sign` | authed presigned R2 room upload (key stays `{merchant_id}/`) |
| POST | `/api/v1/generations` | Studio generate — reuses `createGeneration` (atomic debit + enqueue), product by internal uuid, optional `clientId`, `metadata.source='studio'` |
| POST | `/api/v1/generations/:id/email` | email a finished render as a 7-day signed R2 link (Resend) |

**Credits & billing**
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/credits` | `{ balance, ledger }` |
| GET | `/api/v1/billing/plans` | plan cards + current tier (`buildBillingPlans`) |
| POST | `/api/v1/billing/checkout` | `{ plan }` → Stripe Checkout URL |
| POST | `/api/v1/billing/portal` | Stripe Customer Portal URL |

**Notifications**
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/notifications` | member's notifications + unread count |
| POST | `/api/v1/notifications/read` | mark `{ ids }` or `{ all:true }` read |
| GET / PUT | `/api/v1/notification-prefs` | per-member channel toggles |

**Webhooks & internal**
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/webhooks/stripe` | signature-verified; subscription + credit grant; `invoice.payment_failed` → notify. Idempotent via `webhooks_inbox` |
| GET/POST/PUT | `/internal/inngest` | the Inngest serve endpoint (function registration + step execution + retention cron). `maxDuration` 60s |

> `apps/api/vercel.json` sets `regions: ["fra1"]` and per-route `maxDuration`: `widget/generate` 30s,
> `internal/inngest` 60s.

---

## 8. AI pipeline

All model calls go through **`AIOrchestrator`** (`packages/ai`), the single seam (hard rule #8). Swapping
providers is a one-file change. The current provider is the **Vercel AI Gateway**.

### 8.1 Orchestrator & routing

- **`AIOrchestrator.compose(input)`** — the single composite entrypoint. A per-request **routing policy**
  (`quality | balanced | fast`) maps to an ordered **provider chain**; each provider is retried with
  exponential backoff, then the orchestrator falls back to the next provider in the chain.
- **`AIOrchestrator.estimateQuantity(input)`** — the coverage-quantity pass (#7), beside `compose`.
- **Policy mapping** (`planToPolicy` in the workflow): `free → fast`, `scale`/`enterprise → quality`,
  everything else → `balanced`. Chains (from `factory.ts`): quality = `[quality, fast]`,
  balanced = `[quality, fast]`, fast = `[fast, quality]`.
- **Offline fallback:** with no Gateway credentials (`AI_GATEWAY_API_KEY` or, on Vercel,
  `VERCEL_OIDC_TOKEN`) or with `AI_PROVIDER=mock`, the factory returns a deterministic **mock** provider —
  used by local dev and the e2e script.

### 8.2 Models (env-configurable, defaults in `factory.ts`)

| Role | Default model | Cost knob (¢) |
|---|---|---|
| Quality composite | `google/gemini-3-pro-image` ("Nano Banana Pro") | `GATEWAY_COST_QUALITY` = 13 |
| Fast composite | `google/gemini-3.1-flash-image-preview` ("Nano Banana 2") | `GATEWAY_COST_FAST` = 6 |
| Coverage quantity | `google/gemini-2.5-flash` | — |

Overridable via `GATEWAY_MODEL_QUALITY`, `GATEWAY_MODEL_FAST`, `GATEWAY_MODEL_QUANTITY`,
`GATEWAY_COST_*`, `GATEWAY_IMAGE_SIZE` (default `2K`).

### 8.3 The Gateway provider (`packages/ai/src/providers/gateway.ts`)

- One **multimodal `generateText`** call (AI SDK 6) against an image model. The **ROOM** image is passed
  first and the **PRODUCT** second as message **image parts**; the result image is read from
  `result.files`. (This was chosen over `experimental_generateImage`, which has no typed
  reference-image parameter in AI SDK 6 — D49.)
- It sends `providerOptions.google.imageConfig` with **`aspectRatio` pinned to the uploaded room** and
  **`imageSize: '2K'`**, plus `responseModalities: ['TEXT','IMAGE']` — so the model returns the full
  frame at the room's proportions and can't re-frame/rotate or misjudge scale.
- The network call is an **injectable runner**, so input-ordering + output-extraction are unit-tested
  without hitting the Gateway.
- Other providers (`vertex.ts`, `replicate.ts`) are stubs kept for the one-file-swap guarantee; the
  `fal` provider and `@fal-ai/client` dependency were **removed** (fully on the Gateway, D49/D62).

### 8.4 The prompt surface (`packages/ai/src/prompts/` — the editable surface)

The one place to read/tweak prompts. After editing: `pnpm -F @lumina/ai build`, then redeploy the API.

- **`system.ts` — `COMPOSE_SYSTEM_INSTRUCTION` (the master prompt).** A single structured instruction
  that works for **any** product, **interior or exterior**: `ROLE → GOAL → INPUTS → ANALYZE (4 steps) →
  HARD RULES → OUTPUT → AVOID`. Crucially, it has the **model infer the product's placement archetype
  itself** (open-ended — the examples are illustrative, "NOT an exhaustive list"); there is **no fixed
  category switch**, so results stay reliable for any product (no "unsupported category" cliff). The HARD
  RULES preserve the product's exact geometry/materials/colors/branding, forbid altering the environment,
  and require keeping the **original framing and aspect ratio** (no crop/zoom/rotate) plus physically
  correct contact shadows.
- **`compose.ts` — `buildComposeTask(input)`.** The per-request facts: the merchant category as a
  **soft hint** (labelled "may be inaccurate"), real-world dimensions, the placement hint (or a
  "most natural, functional location" fallback), scene lighting (when a scene analysis is present), an
  **EXTERIOR note** when the scene is exterior, and the shopper's free-text **custom instructions** —
  quoted and subordinated to the HARD RULES (it can refine placement/style but never override product
  identity, environment integrity, scale, or framing).
- **`quantity.ts` — `buildQuantityPrompt()`.** The coverage-quantity estimate prompt.
- **`prompt.ts`** (one level up) is a thin assembler: `buildComposePrompt = system + task`.

### 8.5 Moderation (`packages/ai/src/moderation.ts`)

- Pure policy `classifyInput` / `classifyOutput` behind a `ModerationProvider` seam (mirrors `AIProvider`).
- `classifyInput` rejects: unsafe content (NSFW), a non-environment photo (`sceneScore` below threshold →
  reason `not_environment` — accepts a valid **interior or exterior**), and **face-dominant** photos for
  **non-fashion** categories. `classifyOutput` blocks unsafe composites.
- A reject is **terminal** and **refunds** the credit (never bill a rejected generation).
- **Status:** the policy is implemented and unit-tested; the workflow's `moderation` dependency
  **defaults to an always-safe mock** and the Inngest function does not yet wire a real classifier — so
  moderation is a ready seam, not yet enforced in production. Wiring a real vision classifier is a
  one-file change at the provider seam.

### 8.6 Coverage quantity (#7)

- Only **coverage** categories (`tiles, decor, renovation, outdoor`) hit the model; every other category
  short-circuits to quantity **1 with no model call** (the "shower/wardrobe = 1" rule).
- Coverage products call `GatewayQuantityProvider` — a `generateObject` (Zod-schema) call on
  `google/gemini-2.5-flash`; the number is clamped to `[1, 999]` and only persisted when confident
  (`confidence ≥ 0.5`) and `> 1`. The estimate runs **after** the composite is stored and is best-effort:
  any error/low-confidence leaves the columns null — it can never fail an otherwise-good generation.

### 8.7 Pixel-perfect composite (the realism guarantee, D62)

The model is reference-aware (it inserts the exact product) but re-renders the whole frame. To guarantee
fidelity **by construction**, the workflow post-processes with `sharp` (server-only):

1. **`images/diff-mask.ts` `computeChangeMask(original, edited)`** — per-pixel max-channel diff above a
   threshold → a feathered b/w mask of where the model actually changed the scene (the product + its
   shadows); reports `changedFraction`.
2. **`shouldComposite(changedFraction)`** — guards against an implausibly small (nothing happened) or
   large (a global re-frame) change → fall back to the full render.
3. **`images/composite.ts` `compositeOverOriginal(...)`** — an **explicit raw per-pixel blend**
   (`out = edited·α + original·(1−α)`, α = mask/255): every pixel where the mask is 0 is **byte-identical
   to the upload**. The environment outside the product is preserved exactly — no re-frame, rotation, or
   drift.
4. **`images/dimensions.ts`** reads the room's size and picks the nearest supported aspect ratio to pin
   the compose output.

Knobs (env, with code defaults so they work unset): `CHANGE_MASK_THRESHOLD` (28), `CHANGE_MASK_FEATHER`
(6), `CHANGE_MIN_FRACTION` (0.002), `CHANGE_MAX_FRACTION` (0.6). `sharp` is **lazily loaded**
(`images/sharp.ts`) so a native-binary problem degrades gracefully instead of crashing the route.

> **Rejected:** mask-native inpainters (FLUX.1 Fill) — they are text-only and can't reproduce the
> merchant's *exact* product. Gemini stays the reference-aware compositor and our composite enforces
> fidelity, keeping everything on the one Gateway (D62).

### 8.8 Not yet wired (seams that exist for later)

- **Scene analysis** (lighting/style/surfaces vision pass) and **placement/mask** vision prompts —
  `prompts/README.md` lists `scene.ts`/`placement.ts` as "coming in later stages". `ComposeInput.scene`
  is honored by the prompt if present, but the workflow does not yet run a scene pass.
- **Background removal** of the product image — designed, not wired.

---

## 9. The durable generation workflow (Inngest)

`apps/api/src/lib/inngest/` — the function (`generation.ts`) + the pure pipeline (`workflow.ts`).

### 9.1 Function config

`generationRequested = inngest.createFunction({ id: 'generation-requested', retries: 2, concurrency: [
{ limit: GLOBAL_CONCURRENCY=20 }, { key: 'event.data.merchantId', limit: MERCHANT_CONCURRENCY=3 } ],
onFailure }, { event: 'generation.requested' }, handler)`. The handler runs the work inside a single
`step.run('process-generation', …)` building the deps (R2 storage, orchestrator from env, db, email,
event sink, reportError, notify).

### 9.2 `processGeneration` pipeline

1. Load the generation; skip if not `queued`/`processing` (idempotent).
2. Flip to `processing` (inside the try, so even a hiccup here refunds + fails).
3. **Sanitize the room on ingest** — strip EXIF/GPS (`stripJpegMetadata`, pure JPEG segment stripper; no
   native dep) and re-store; presign a download URL.
4. **Pin the aspect ratio** — read the room's size, pick the nearest supported aspect ratio.
5. **Moderate input** — reject → refund + notify + terminal `failed` (currently the always-safe mock).
6. **Pre-passes (parallel) + compose** — run two best-effort pre-passes together: (a) resolve the product
   image to a background-removed **matting cutout** cached on `products.clean_image_key` (degrades to the
   raw image, D63), and (b) **scene analysis** returning per-image facts — lighting, surfaces, tilt, scale,
   placement region (low-confidence dropped, D64). Then `AIOrchestrator.compose({ room, product, category,
   placementHint, customInstructions, dimensions, scene, aspectRatio, policy, watermark })`.
7. **Pixel-perfect** — `keepOnlyProductChange(original, composed)` (§8.7): diff → composite the changed
   region over the original (or keep the full render if the change is implausible). Never throws.
8. **Moderate output** — unsafe → refund + terminal `failed`.
9. **Store** to R2 (`results/{merchant_id}/{generationId}`).
10. **Coverage-quantity estimate** (#7) — best-effort, never fails the generation.
11. **Finalize** — `succeeded`, write `result_key, model, cost_cents, latency_ms, suggested_quantity,
    quantity_rationale`, the result asset, and a `success` usage event (one transaction). Emit an Axiom
    event.

### 9.3 Failure handling (never leave it hanging)

- **In-handler catch** → `refundAndFail` (terminal `failed` + refund) + notify + event.
- **`refundAndFail` is idempotent**: the status flip is conditional on the row still being
  `queued`/`processing`, and the refund (`grant_credits(…, 'refund')`) only fires when it actually
  transitioned — because `grant_credits()` is not itself idempotent. This stops any double-refund across
  retries / the onFailure net.
- **`onFailure` net** — when a run dies **outside** the handler's try (a module-load crash, an OOM, a
  function timeout), Inngest's `onFailure` calls `markFailed()` to mark the generation `failed` + refund
  (idempotently). This is the safety net for the "stuck in QUEUED" failure class.

### 9.4 Retention cron

An Inngest cron (`RETENTION_CRON`, `RETENTION_DAYS`) runs `purgeGenerationsOlderThan` — deletes old
generations + their room/result R2 objects. The credit ledger survives because `generations.id` references
in the ledger are `ON DELETE SET NULL`, so balances never drift.

---

## 10. End-to-end flows

### 10.1 Widget generation (the core)

1. Merchant pastes the loader `<script>` + a trigger/placeholder. The loader injects the app bundle; the
   app boots a Shadow DOM root and `GET /widget/config` (key + Origin checked).
2. Shopper clicks a trigger → modal opens. Step 1: **provide a room photo** (drag/drop, file picker, or
   **camera** via `getUserMedia`). Client-side: validate, **downscale ≤ 2048px**, EXIF-orient, re-encode
   (WebP→JPEG) — which also strips EXIF/GPS.
3. `POST /widget/sign-upload` → presigned PUT; the widget **PUTs the photo directly to R2** (no server
   hop). `upload:done` fires with the `roomKey`.
4. Step 2 (confirm): the shopper picks a **placement chip** (auto/floor/wall/table/corner → `placementHint`)
   and may fill the **custom-instructions** textarea (≤ 280 chars).
5. `POST /widget/generate` → the server revalidates key/domain + rate limits + **anon daily cap**,
   resolves the product, computes the **idempotency key**
   (`sha256(merchant|product|room|hint|customInstructions)`), returns a cached succeeded result for 0
   credits if found, else **`debit_credits` (1)** + inserts a `queued` generation + sends
   `generation.requested` to Inngest → `{ generationId, status:"queued" }`.
6. The widget **polls** `GET /widget/status/:id` with capped exponential backoff until terminal (D21 —
   polling keeps the bundle under budget; a Realtime transport is a future lazy-loaded drop-in).
7. On success: render a **before/after** slider, **Save** (download), **Share**, and the merchant's
   **result CTA** (which interpolates `{productId}/{productUrl}/{quantity}` into the `urlTemplate` and
   opens it in a new tab). For coverage products a **quantity stepper** (seeded from the AI suggestion)
   feeds `{quantity}`. The shopper can 👍/👎 (`feedback`) or regenerate (a new credit).

### 10.2 Studio generation (physical store, #8)

The dashboard `/studio` flow reuses the **same** `createGeneration` service + Inngest workflow as the
widget (same atomic debit + refund-on-fail): upload room (`/uploads/sign`, authed) → pick a catalog
product (by internal uuid) → optionally attach a **client** → generate → poll → before/after → **email a
7-day signed link** to the client or download. Studio rows carry `metadata.source='studio'` and an
optional `client_id`.

### 10.3 Onboarding, billing, notifications

- **Onboarding** — a 5-step checklist whose completion is **derived from live signals** (widget config ≠
  defaults, products, install/impressions, generations), not stored flags.
- **Billing** — a plan card → Stripe Checkout; "Manage billing" → Stripe Customer Portal; the webhook
  grants the plan's included credits and sets the plan (idempotent via `webhooks_inbox`).
- **Notifications** — actionable-only events (`generation_failed`, `low_credits`, `payment_failed`)
  fanned out one row per member, in-app (a topbar bell polling every 60s) + email (Resend), per-member
  channel toggles.

---

## 11. The widget (`apps/widget`)

### 11.1 Principles

Tiny & non-blocking; **zero collisions** (all UI inside a Shadow DOM, single `window.Lumina` namespace,
no style leakage either way); a command queue buffers calls made before the bundle loads; framework-
agnostic (works on static HTML, Shopify Liquid, React, anything — no merchant build step); resilient
(network failures degrade gracefully, events for merchants to hook).

### 11.2 The 2-file loader (D22)

```html
<script async src="https://cdn.lumina.app/widget.js" data-site-key="pk_live_…"></script>
<button data-lumina-trigger data-lumina-product="SKU-1234">Try in your room</button>
```

`widget.js` is the **immutable loader** (~1.7 KB raw / ~0.8 KB gz, no imports): reads `data-*`, creates
the `window.Lumina` queue, injects the **content-hashed** app bundle `widget.[hash].js`. `build.mjs`
builds the app first, injects its URL into the loader via Vite `define`, then enforces the **< 45 KB
gzip** budget (actual app bundle ≈ 31 KB gz). The merchant never edits their HTML again.

### 11.3 Public JS API & declarative attributes

- `Lumina.init(config)` · `open(opts)` · `close()` · `configure(partial)` · `on/off(event, handler)` ·
  `preload()` · `version`.
- Declarative: `data-lumina-trigger` (any element becomes a launcher), `data-lumina-product`,
  `-product-name`, `-product-image`, `-category`, `-locale`; `data-lumina-button` placeholder where the
  widget paints its **own** styled launcher into its own Shadow root (D51). A `MutationObserver` binds
  elements added later (SPA grids).

### 11.4 Events (D-API §3.6)

Delivered via `Lumina.on(event, handler)` **and** as `window` CustomEvents (`lumina:<event>`):
`ready, open, close, upload:start, upload:done, generate:start, generate:progress, generate:success,
generate:error, result:save, result:share, feedback, cta:click`. `cta:click`, `generate:success`, and
`feedback` are the conversion/ROI signals.

### 11.5 Architecture, i18n, image pipeline

- **Framework-agnostic core** in `src/core` (config/`mergeConfig`, API client, the `LuminaController`
  state machine, status transport, i18n, image pipeline) — pure/injectable, unit-tested under happy-dom.
  A thin **Preact view** in `src/ui` (Shadow-DOM mount, focus-trapped modal, step components, before/after
  slider) only renders controller state.
- **i18n:** `it, en, de, fr, es`. Locale precedence (`mergeConfig`): explicit `data-lumina-locale`/`init`
  → **merchant (remote) config** → host page `<html lang>` (fallback only) → `en`.
- **Image pipeline:** downscale ≤ 2048px + EXIF-orientation fix + re-encode (WebP→JPEG), which strips
  EXIF/GPS client-side (defense-in-depth; the server strips again). Pure helpers
  (`computeTargetSize`/`parseExifOrientation`/`pickEncoding`/`applyOrientation`) are tested.
- **Anonymous id:** a client-generated UUID in `localStorage` (`lumina_anon_id`), sent as `anonId` for
  per-visitor abuse caps; tolerates blocked storage with an ephemeral id.
- **Mobile-first:** bottom-sheet < 640px, centred ≥ 640px, `max-height: 92vh` + scroll.
- **CSP (strict-CSP merchants):** documented `script-src cdn`, `connect-src api + r2-host`,
  `img-src r2-host blob: data:`.

### 11.6 Build-time config (never secrets)

`PUBLIC_API_URL` (must include the `/api` suffix — the widget calls `${base}/v1/widget/…`),
`PUBLIC_CDN_URL` (the absolute app-bundle origin the loader injects), `PUBLIC_SENTRY_DSN`.

---

## 12. The merchant dashboard (`apps/dashboard`)

### 12.1 Architecture

- **Design system (D27):** `@lumina/ui` ships the ported design as global CSS
  (`styles/{tokens,components,app}.css` → `@lumina/ui/styles.css`), imported once in the root layout;
  screens use the prototype class names (`.card`, `.kpi`, `.table`, `.side`, `.topbar`…) for fidelity.
  Large charts use **Recharts** (styled with `--viz-*` tokens); KPI sparklines + the funnel are inline SVG.
- **Data layer (D28):** server components/actions call the **merchant API** in `@lumina/api` over HTTP via
  `lib/api.ts` (which **forwards the Supabase session cookie**) and validate responses with shared Zod
  schemas. **No DB access or secrets in the dashboard.**
- **Shell:** the `(app)` route group gates the session, provisions the merchant on first login, and renders
  `Sidebar` (merchant switcher, grouped nav, credit pill, account) + `Topbar` (route title, Test/Live env
  toggle, theme toggle, notification bell, account). Theme (light/dark via `:root[data-theme]`, no-flash
  inline script) + env live in a thin client provider.

### 12.2 Screens

| Screen (route) | What it does |
|---|---|
| **Overview** (`/overview`) | ROI dashboard — KPIs (+ deltas, sparklines), conversion funnel, generations/CTA timeseries, top products, recent strip. |
| **Widget Settings** (`/widget`) | Theme/copy/CTA/branding form + self-contained **live preview that renders the real widget** (D52, mounted in a Shadow root); saved to `/v1/widget-config`. Result-CTA autopopulates from platform presets. |
| **Script & Install** (`/script`) | Platform picker (generic script live; WordPress/Shopify/WooCommerce/Wix/Squarespace "coming soon") → env-aware loader + trigger snippets (shows the publishable-key **prefix**, never a fabricated key) + verify checklist. |
| **Onboarding** (`/onboarding`) | 5-step checklist, completion derived from live signals. |
| **Products** (`/products`) | Catalog table (search/category filter), add/edit drawer, **client-parsed CSV import** (per-row errors), soft-delete archive. |
| **Generations** (`/generations`) | Status-filtered card gallery, cursor "Load more", before/after wipe detail with run metadata. |
| **Analytics** (`/analytics`) | 7/30/90d range selector over the same analytics API. |
| **Credits & Billing** (`/billing`) | Credit meter, plan cards (upgrade → Stripe Checkout, manage → portal), credit ledger. |
| **Settings** (`/settings`) | Account rename, reveal-once API keys, allowed domains (validated by shared `HostnameSchema`), notification preferences, team list, honest danger zone (cancel via portal, delete via the real `DELETE /v1/merchant`). |
| **Studio** (`/studio`, `/studio/new`, `/studio/clients`, `/studio/clients/[id]`) | The in-dashboard "try in your room" for physical stores, as a navigable section: **Overview** (stats + recent renders + recent clients), **New** (the wizard), **Clients** (searchable rubric with render count + last activity), **client detail** (editable contact/notes + that client's render history). Server-mediated via `lib/studio-actions.ts`. |
| **Notifications** (topbar bell) | Polls every 60s; actionable alerts fanned out per member, in-app + email. |
| **Auth + 404** | Reskinned login (email/password + Google) and a branded not-found page. |

### 12.3 Responsive (D55)

- **> 1024px:** sidebar is a fixed column; KPI grid 4-up; editors two-column.
- **≤ 1024px:** sidebar collapses to an off-canvas **drawer** (topbar hamburger, scrim to dismiss, closes
  on navigation); KPI grid 2-up; Widget Settings stacks; wide tables scroll (`.table-scroll`).
- **≤ 560px:** KPI grid 1-up; product dimensions row 2-up.

---

## 13. Billing & credits

- **Stripe** Billing + Checkout + Customer Portal. Plan ↔ Stripe price via `STRIPE_PRICE_<TIER>` env;
  included credits come from `PLAN_CATALOG` (`@lumina/shared`).
- **Webhook** (`/v1/webhooks/stripe`): verify signature → normalize (`toBillingEvent`) → apply
  (`applyBillingEvent`): upsert subscription, set plan, `grant_credits()` the included credits — one
  transaction, deduped on `webhooks_inbox.id`. `invoice.payment_failed` → a `payment_failed` notification.
- **Credits:** append-only `credit_ledger`; `merchants.credits_balance` is the denormalized cache
  (== `SUM(amount)`). Debit atomically with `debit_credits()` before enqueuing; refund with
  `grant_credits(…, 'refund')` (guarded/idempotent). `low_credits` fires once as the balance crosses the
  threshold (20) downward.

---

## 14. Notifications (D56)

- **Actionable-only:** `generation_failed`, `low_credits`, `payment_failed` (never a per-success ping).
- **Fan-out** one `notifications` row per merchant member (read-state is per-person); `notification_prefs`
  holds each member's `type → {inApp,email}` toggles (defaults both on). Both tables are server-written
  (service role) with a user-scoped RLS read policy; `notifications` is in the Realtime publication.
- **Email** via a small `EmailSender` port (`apps/api/src/lib/email`): a Resend REST adapter when
  `RESEND_API_KEY` is set, else a no-op. `notifyMerchant` is best-effort (`Promise.allSettled`) — email
  failures never change a workflow outcome.
- **Transport:** the bell **polls** every 60s (seeded server-side). The Realtime publication makes a push
  transport a later drop-in.

---

## 15. Security, privacy, GDPR

- **Tenant isolation** at three layers (§2.3); R2 keys merchant-prefixed; RLS on the dashboard path; the
  D46 lockdown denies client roles on server-only tables.
- **Secrets** only via env, never client-side. The widget only ever sees a `site_key`, presigned URLs, a
  `generationId`. `.env*` is never committed; `.env.example` is the source of truth for names.
- **Keys:** stored as `sha256(raw)` + prefix; raw revealed once; timing-safe verification; revocable.
- **EXIF/GPS** stripped twice — client-side (canvas re-encode) and server-side (`stripJpegMetadata`,
  sanitize-on-ingest) — because room photos are people's homes.
- **Moderation** seam (§8.5): reject non-environment / unsafe / face-dominant (non-fashion); a reject
  refunds. (Real classifier not yet wired — defaults to the always-safe mock.)
- **GDPR erasure** (`purgeMerchant`, owner-only `DELETE /v1/merchant`): deletes the merchant row (every
  tenant table cascades on `merchant_id`) + R2 objects by `{root}/{merchant_id}/` prefix; the ledger is
  preserved (`generation_id` → `SET NULL`). **Retention** cron purges old generations + their objects.
- **Abuse caps:** Upstash per-`site_key` rate limits + per-anonymous-visitor daily generation caps
  (`RATE_PER_MINUTE`, `ANON_DAILY_CAP`).

---

## 16. Observability

- **Axiom** — `createEventSink` POSTs a pure `generationEvent` (cost/latency/model/status) from every
  workflow terminal path (success + each failure/reject), fire-and-forget, only when `AXIOM_TOKEN` +
  `AXIOM_DATASET` are set (console fallback otherwise). `AXIOM_URL`, when set, is treated as the **complete
  ingest URL** (D47 — region/endpoint is deployment config).
- **Sentry** — DSN env vars exist (`SENTRY_DSN`, `SENTRY_RELEASE`); the SDK is **not yet wired in code**
  (a documented deploy step, deferred to avoid heavy deps before the joint deploy).
- **`reportError`** — the workflow's error reporter hook (Sentry-bound once wired).

---

## 17. Third-party services

| Service | Role | Auth / env | Status |
|---|---|---|---|
| **Vercel** | Hosting for `@lumina/api` + `@lumina/dashboard` (+ a static project for the widget); Git auto-deploy | Vercel project env | Live (staging) |
| **Vercel AI Gateway** | All image-model calls behind `AIOrchestrator` | `AI_GATEWAY_API_KEY` (local) / `VERCEL_OIDC_TOKEN` (Vercel) | Live (paid credits required for image models) |
| **Supabase** | Postgres + Auth + Realtime publication | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `DATABASE_URL` | Live (staging) |
| **Cloudflare R2** | Object storage (rooms/products/results, merchant-prefixed), S3 API | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE` | Live (bucket `lumina-staging`) |
| **Inngest** | Durable generation workflow + retention cron | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Live (functions synced) |
| **Upstash Redis** | Rate limit · idempotency · anon caps · cache | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Live |
| **Stripe** | Billing (Checkout, Portal, webhooks, metered) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Live (sandbox) |
| **Resend** | Transactional email (notifications, Studio result links) | `RESEND_API_KEY`, `RESEND_FROM` | Wired (no-op when unset) |
| **Axiom** | Events/telemetry | `AXIOM_TOKEN`, `AXIOM_DATASET`, `AXIOM_URL` | Wired |
| **Sentry** | Error tracking | `SENTRY_DSN`, `SENTRY_RELEASE` | Planned (not wired in code) |

> The original design placed the **widget loader** behind a Cloudflare CDN/Worker (see
> `infra/cloudflare/`), and an **image-resizing CDN** (`/cdn-cgi/image/…`) in front of R2. The current
> deployment serves the **widget from a standalone Vercel static project** and serves R2 objects via
> **short-lived signed GET URLs** (D50 — `R2_PUBLIC_BASE` unset in prod; the bucket stays private). The
> resize-CDN optimization can return once a Cloudflare-fronted public domain exists.

---

## 18. Infrastructure & deployment

### 18.1 Topology (as deployed)

- **`@lumina/api`** and **`@lumina/dashboard`** → two Vercel projects (Next.js), region `fra1`.
- **`@lumina/widget`** → a standalone Vercel **static** project (serves the loader + content-hashed
  bundle), auto-rebuilt on push (`apps/widget/vercel.json`, `build:bundle`).
- **Inngest Cloud** → calls `…/internal/inngest` for durable steps + the retention cron.
- **Supabase** (Postgres + Auth + Realtime), **Cloudflare R2** (images), **Upstash** (Redis),
  **AI Gateway** (models), **Stripe/Resend/Axiom**.

### 18.2 CI/CD (`.github/workflows/ci.yml`)

- **`quality`** job (on push to `main`/`master` + every PR): pnpm install (frozen) → **lint → typecheck →
  build → widget bundle budget (< 45 KB gz) → test** against a `postgres:16-alpine` service
  (`TEST_DATABASE_URL`). Tests run serialized on CI (`pnpm test -- --concurrency=1`) because the db + api
  integration suites share the single CI Postgres.
- **`migrate`** job (`needs: quality`, master-push only): `pnpm db:migrate` with the `DATABASE_URL`
  Actions secret — the Supabase **session pooler (5432)** (the transaction pooler breaks the migrator's
  prepared statements).
- **Deploy:** Vercel's Git integration auto-builds + deploys all three projects on push to `master`.

### 18.3 The DB pooler split (important)

- **Runtime** (Vercel API + Inngest workflow) uses the **transaction pooler (6543)** with
  `createDb(url, { max: 1, prepare: false, idle_timeout: 20 })` — the correct config for the transaction
  pooler (no server-side prepared statements). The old session pooler + `max:10` per instance exhausted
  the pool under generate + Inngest concurrency (`EMAXCONNSESSION`) and left generations stuck in
  `queued`.
- **CI migrations** use the **session pooler (5432)** (the drizzle migrator needs it).

### 18.4 Current deployment URLs (staging-live)

- API: `https://lumina-api-iota.vercel.app`
- Dashboard: `https://lumina-dashboard-one.vercel.app`
- Widget CDN: `https://lumina-widget.vercel.app` (serves `widget.js` + `widget.[hash].js`)
- Vercel team `rdlabs-team`; projects `lumina-api`, `lumina-dashboard`, `lumina-widget`.
- Supabase staging project (eu-west-1); R2 bucket `lumina-staging`.

(Provisioning/deploys are done with the vendor CLIs — `supabase`, `vercel`, `wrangler`, `stripe`, `gh`,
`inngest` — not by hand-editing dashboards.)

---

## 19. Environment variables reference

Names are the source of truth (`.env.example`); `.env*` is never committed.

```
# Supabase / DB
SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · SUPABASE_ANON_KEY · DATABASE_URL

# Object storage (Cloudflare R2)
R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET · R2_PUBLIC_BASE

# Cache / rate limit (Upstash)
UPSTASH_REDIS_REST_URL · UPSTASH_REDIS_REST_TOKEN
RATE_PER_MINUTE · ANON_DAILY_CAP

# AI (Vercel AI Gateway)
AI_GATEWAY_API_KEY          # or VERCEL_OIDC_TOKEN on Vercel; AI_PROVIDER=mock forces the mock
GATEWAY_MODEL_QUALITY · GATEWAY_MODEL_FAST · GATEWAY_MODEL_QUANTITY
GATEWAY_COST_QUALITY · GATEWAY_COST_FAST · GATEWAY_IMAGE_SIZE
# pixel-perfect composite knobs
CHANGE_MASK_THRESHOLD · CHANGE_MASK_FEATHER · CHANGE_MIN_FRACTION · CHANGE_MAX_FRACTION

# Workflow (Inngest)
INNGEST_EVENT_KEY · INNGEST_SIGNING_KEY
GLOBAL_CONCURRENCY · MERCHANT_CONCURRENCY
RETENTION_DAYS · RETENTION_CRON

# Billing (Stripe)
STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER · STRIPE_PRICE_GROWTH · STRIPE_PRICE_SCALE · STRIPE_PRICE_ENTERPRISE

# Email (Resend)
RESEND_API_KEY · RESEND_FROM

# Observability
AXIOM_TOKEN · AXIOM_DATASET · AXIOM_URL · SENTRY_DSN · SENTRY_RELEASE

# URLs
APP_URL · API_URL · CDN_URL

# Widget build-time (never secrets)
PUBLIC_API_URL · PUBLIC_CDN_URL · PUBLIC_SENTRY_DSN
```

---

## 20. Testing strategy

- **Unit/integration (Vitest):** every package + app. Pure logic is unit-tested; DB/RLS/plpgsql is
  exercised on **real Postgres via Testcontainers** (`@lumina/db/testing`), with a Supabase `auth` shim
  (`auth.uid()`, roles) so the same migrations apply on bare Postgres. The API integration suites run
  against Testcontainers too.
- **Offline e2e:** `pnpm -F @lumina/api e2e` runs the full generate → workflow → cache path with the mock
  provider + Testcontainers (no external services).
- **Widget e2e (Playwright):** `apps/widget/e2e/widget.spec.ts` against a mock API + `test-store.html`
  (fake camera/media device), including a 360px-viewport mobile test.
- **Eval harness:** pure `scoreEval` (success/latency/cost/👍 rate by category) + `pnpm -F @lumina/api
  eval` over a golden set (`apps/api/scripts/eval-golden.json`) — mock offline, real Gateway when keyed.
- **Quality gates (DoD):** lint clean · typecheck clean · tests written first and passing · no secret
  committed · tenant scoping intact · README/docs updated when behavior changes · Conventional Commit.

---

## 21. Implementation status & divergences from the original spec

**Built & live (staging):** the full monorepo; the DB (migrations 0000–0009) with RLS + the D46 lockdown;
Supabase Auth; the merchant API (35 routes) + the public widget API; the widget (Preact/Shadow DOM,
< 45 KB, polling transport, declarative + programmatic install, launcher placeholder, i18n, client image
pipeline); the dashboard (all screens incl. Studio + notifications); the AI pipeline on the **Vercel AI
Gateway** (compose + coverage-quantity) with the editable master prompt and the **pixel-perfect composite**;
the Inngest workflow with atomic debit + refund + the `onFailure` net; Stripe billing; Resend email;
Upstash rate limits; Axiom telemetry; CI/CD with auto-deploy.

**Divergences from `LUMINA_Technical_Architecture.md` (the original design):**

| Area | Original design | Actual |
|---|---|---|
| AI gateway | fal.ai (Nano Banana Pro / FLUX.2) | **Vercel AI Gateway**, multimodal `generateText`; fast tier is Nano Banana 2 (`gemini-3.1-flash-image-preview`); fal removed (D49) |
| Realism | "ask the model to keep framing" | **pixel-perfect composite by construction** (diff-mask + raw blend over the original, `sharp`); FLUX.1 Fill rejected (D62) |
| Status transport | Supabase Realtime push | **polling** in the bundle (D21); Realtime publication exists as a future drop-in |
| Image delivery | Cloudflare image-resize CDN | **signed R2 GET URLs**, bucket private (D50); resize-CDN deferred |
| Widget hosting | Cloudflare CDN/Worker | **Vercel static project** (Cloudflare Worker config exists in `infra/` for later) |
| Moderation | live classifier | policy + seam implemented; **real classifier not yet wired** (defaults to always-safe mock) |
| Sentry | wired | env vars present; **SDK not yet wired in code** |

**Designed but not yet wired (seams exist):** scene-analysis and placement/mask vision passes
(`prompts/README.md` "coming in later stages"); product background removal; batch/pre-generate gallery;
workspaces (#2) + team invites (#3); the fashion module.

---

*This document reflects the codebase as explored. When in doubt, the code, `docs/DECISIONS.md`, and the
per-package READMEs are authoritative; update this file when behavior changes.*

# M4 — Merchant Dashboard (`apps/dashboard` + merchant API) — Implementation Plan

> **For agentic workers:** TDD the testable parts (merchant API services + shared schemas + UI logic);
> build screens grounded in the ported design system. Steps use checkbox (`- [ ]`) syntax. Phased — pause
> for review after each phase.

**Goal:** A merchant can self-serve the entire lifecycle — sign up → install → add a product → see a
generation → read analytics → manage billing — in a premium, pixel-faithful dashboard, with no manual
intervention. (M4 acceptance, architecture §8-M4.)

**Architecture:** The dashboard (`apps/dashboard`, Next 15 App Router) renders the screens and calls the
**merchant API** in `apps/api` over HTTP, forwarding the Supabase session cookie (the existing
`lib/api.ts` pattern, D28). The merchant endpoints (§6.3) are session-authed, merchant-scoped (RLS), and
Zod-validated; their logic lives in framework-agnostic `apps/api/src/lib/*` services, TDD'd with
Testcontainers exactly like M1/M2. The locked **design system** ships from `packages/ui` as global CSS
(D27); screens use the prototype's class names for fidelity. Wire contract types live in
`packages/shared`.

**Tech Stack (new for M4):** `recharts` (timeseries/analytics charts) · `papaparse` (CSV import) in the
dashboard. No new backend deps.

**Design source of truth:** the Claude Design bundle — `lumina-tokens.css` / `lumina-components.css` /
`lumina-app.css` + the Overview & Widget Settings prototypes (ported into `docs/design/` for reference).

---

## Decisions (append to docs/DECISIONS.md)
- **D27 — Design system = global CSS from `packages/ui`.** The three prototype stylesheets are copied
  verbatim into `packages/ui/styles/{tokens,components,app}.css`, re-exported as `@lumina/ui/styles.css`,
  imported once in the dashboard root layout; screens use the prototype class names (`.card`, `.btn`,
  `.kpi`, `.table`, `.side`, `.topbar`…) for pixel fidelity. Fonts load via the design's Google-Fonts
  `@import` (next/font optimization deferred to M5).
- **D28 — Dashboard ↔ API over HTTP with the forwarded Supabase session.** All merchant endpoints live in
  `apps/api` (§6.1 "same Vercel app"); the dashboard's server components/actions call them via
  `lib/api.ts` (cookie-forwarding `apiFetch`) and validate responses with shared Zod schemas. No DB access
  or secrets in the dashboard.
- **D29 — Analytics via merchant-scoped SQL aggregation.** `summary`/`timeseries` are computed in
  `apps/api` over `usage_events` + `generations` + the credit ledger (RLS-enforced), shaped to Zod
  response schemas; the dashboard renders with skeletons + empty states.
- **D30 — Recharts for the large charts; inline SVG for sparklines/funnel.** Bigger timeseries/analytics
  charts use Recharts styled with the `--viz-*` tokens; KPI sparklines + the funnel stay inline SVG (as the
  prototype) to keep the page light.
- **D31 — Theme + env are client state in a small provider.** Light/dark via `:root[data-theme]` (design
  tokens already define both); Test/Live env toggle persisted per-merchant in a cookie; both exposed via a
  thin client provider so server components stay the default.

---

## Phases (each ends with: lint + typecheck + build + tests green, README touched, commit, **pause for review**)

- **Phase A — Foundation:** `packages/ui` (ported design system) · dashboard app shell (sidebar + topbar +
  theme/env providers) · **Overview** screen · merchant API: `analytics/summary`, `analytics/timeseries`,
  `credits`.
- **Phase B — Configure:** **Widget Settings** (persistent live preview) · **Script & Install** · the
  5-step **Onboarding** wizard · merchant API: `widget-config` GET/PUT (+ reuse M1 domains/keys).
- **Phase C — Catalog & results:** **Products** (table + add/edit + CSV import) · **Generations** gallery
  (grid + detail before/after) · **Analytics** · merchant API: `products` CRUD + `bulk`, `generations`
  list/detail.
- **Phase D — Money & account:** **Credits & Billing** (balance, plan cards, usage meter, ledger, portal) ·
  **Settings** (team/roles, API keys reveal-once + revoke, domains, danger zone) · **Auth** reskin · 404 ·
  merchant API: `billing/plans`, `credits` ledger (reuse M1 checkout/portal/keys/domains).

---

## File structure (Phase A in full; B–D summarized)
```
packages/ui/
  package.json                 # exports ./styles.css (+ ./styles/*), sideEffects: ["*.css"]
  styles/tokens.css            # ← lumina-tokens.css (verbatim)
  styles/components.css        # ← lumina-components.css (verbatim)
  styles/app.css               # ← lumina-app.css (verbatim)
  styles/index.css             # @import the three, in order
  src/index.ts                 # NAV_ITEMS + a few shared TS constants (no components yet)
docs/design/                   # the prototype HTML + assets, committed for reference
apps/dashboard/src/
  app/layout.tsx               # import '@lumina/ui/styles.css'; ThemeProvider + Providers
  app/(app)/layout.tsx         # AppShell (sidebar + topbar) for authed pages
  app/(app)/overview/page.tsx  # Overview (server component) → fetch summary/timeseries/credits/recent
  components/shell/{Sidebar,Topbar,MerchantSwitcher,EnvToggle,ThemeToggle}.tsx
  components/overview/{KpiRow,FunnelCard,TimeseriesChart,TopProducts,RecentStrip,Banner}.tsx
  components/ui/{Skeleton,EmptyState,Toast,Icon}.tsx
  lib/api.ts                   # + fetchAnalyticsSummary/Timeseries, fetchCredits, fetchGenerations
  lib/format.ts                # compact numbers, %, dates, delta (pure, tested)
  lib/providers.tsx            # ThemeProvider (data-theme) + EnvProvider (test/live cookie)
apps/api/src/
  lib/analytics/service.ts     # summary(db, merchantId, range) + timeseries(...) (SQL agg, tested)
  lib/credits/service.ts       # getBalanceAndLedger(db, merchantId) (tested)
  app/api/v1/analytics/summary/route.ts  timeseries/route.ts
  app/api/v1/credits/route.ts
packages/shared/src/
  analytics.ts                 # AnalyticsSummary, TimeseriesPoint/Response, FunnelStep schemas
  credits.ts                   # CreditsResponse (balance + ledger entry) schema
  dashboard.ts (or extend)     # GenerationListItem, Paginated<T> helpers as needed
```

---

## Phase A — Tasks (TDD order)

### Task A1: `packages/ui` — port the design system
- [ ] Create `packages/ui/package.json` (`name: @lumina/ui`, `type: module`, `exports`:
      `"./styles.css": "./styles/index.css"`, `"./styles/*": "./styles/*"`, `sideEffects: ["**/*.css"]`).
- [ ] Copy the three stylesheets **verbatim** into `styles/tokens.css`, `styles/components.css`,
      `styles/app.css`; `styles/index.css` = `@import './tokens.css'; @import './components.css'; @import
      './app.css';`. Copy the prototype HTML/CSS into `docs/design/` for reference.
- [ ] `src/index.ts`: export `NAV_ITEMS` (label, href, icon key, optional group) matching the prototype
      sidebar, and `PREVIEW_STATES`. Add `@lumina/ui` to the dashboard deps.
- [ ] Verify: `pnpm -F @lumina/ui lint` + repo build still green (CSS-only package builds trivially).
- [ ] commit `feat(ui): port LUMINA design system (tokens + components + app shell) to packages/ui`

### Task A2: dashboard format helpers (pure, TDD)
- [ ] `lib/format.ts`: `compact(n)` (12_847 → "12,847"; 218_400 → "218.4k"), `pct(n,digits)`,
      `delta(curr, prev)` → `{ pctChange, dir: 'up'|'down'|'flat' }`, `shortDate`/`rangeLabel`.
- [ ] Tests: thousands vs k/M formatting, percentage rounding, delta sign + zero, date range label.
- [ ] commit `feat(dashboard): number/date/delta formatting helpers`

### Task A3: shared schemas — analytics + credits
- [ ] `packages/shared/src/analytics.ts`: `AnalyticsSummarySchema` (`{ range:{from,to}, impressions,
      opens, generations, successRate, ctaClicks, saves, topProducts: [{ id,name,category,generations,
      successRate }] }`), `FunnelStepSchema`, `TimeseriesPointSchema` (`{ t, generations, ctaClicks }`),
      `TimeseriesResponseSchema`. `credits.ts`: `LedgerEntrySchema` (`{ id, amount, reason, createdAt,
      balanceAfter? }`), `CreditsResponseSchema` (`{ balance, included, used, resetsAt, ledger[] }`). Export
      from `index.ts`.
- [ ] Tests: valid parse + a rejection per schema.
- [ ] commit `feat(shared): analytics + credits dashboard schemas`

### Task A4: merchant API — credits service + route (TDD, Testcontainers)
- [ ] `apps/api/src/lib/credits/service.ts`: `getCreditsView(db, merchantId)` → balance (ledger SUM /
      cache), included/used for the period, `resetsAt`, recent ledger entries (merchant-scoped).
- [ ] `app/api/v1/credits/route.ts`: session auth → `getActiveMerchantId` → `getCreditsView` → Zod envelope.
- [ ] Tests (asUser RLS): balance matches ledger sum; ledger entries are tenant-scoped (no cross-tenant).
- [ ] commit `feat(api): GET /v1/credits — balance + ledger (merchant-scoped)`

### Task A5: merchant API — analytics service + routes (TDD, Testcontainers)
- [ ] `apps/api/src/lib/analytics/service.ts`: `summary(db, merchantId, {from,to})` (aggregate
      `usage_events` by type → impressions/opens/generations/ctaClicks/saves, successRate from
      `generations`, topProducts join) and `timeseries(db, merchantId, {metric,interval,from,to})`
      (bucketed counts). Pure SQL via drizzle; empty range → zeros.
- [ ] Routes `analytics/summary`, `analytics/timeseries` (session + merchant scope + Zod).
- [ ] Tests: seed events for a merchant → summary counts + successRate correct; a second merchant's
      events never leak; timeseries buckets align; empty merchant → zeros.
- [ ] commit `feat(api): analytics summary + timeseries (merchant-scoped SQL aggregation)`

### Task A6: dashboard providers + app shell
- [ ] `lib/providers.tsx`: `ThemeProvider` (toggles `:root[data-theme]`, persists to `localStorage` +
      respects system), `EnvProvider` (test/live, persisted in a cookie). `app/layout.tsx` imports
      `@lumina/ui/styles.css` and wraps `Providers`.
- [ ] `components/shell/Sidebar.tsx` (merchant switcher, grouped `NAV_ITEMS`, active state from pathname,
      credit pill from `fetchCredits`, account row from `fetchMe`), `Topbar.tsx` (page title slot,
      `EnvToggle`, search, notifications, avatar, `ThemeToggle`), `app/(app)/layout.tsx` = `.app` grid.
- [ ] Tests: `NAV_ITEMS` active-match helper (pathname → active item) is pure + tested; shell renders the
      nav + merchant name (RTL/happy-dom render smoke).
- [ ] commit `feat(dashboard): app shell — sidebar, topbar, theme + env providers`

### Task A7: Overview screen
- [ ] `app/(app)/overview/page.tsx` server component fetches summary + timeseries + credits + recent
      generations in parallel; passes to client chart components. `components/overview/*`: `Banner`,
      `KpiRow` (4 KPI tiles w/ inline-SVG sparklines + delta), `TimeseriesChart` (Recharts area+line,
      `--viz-*` tokens), `FunnelCard` (inline-SVG bars), `TopProducts`, `RecentStrip`. `Skeleton` +
      `EmptyState` for loading / no-data.
- [ ] Tests: `buildFunnel(summary)` (impressions→opens→generations→saves→cta with conversion %) is pure +
      tested; KPI delta rendering helper tested. UI render smoke (Overview renders KPI labels) under
      happy-dom with mocked fetch.
- [ ] commit `feat(dashboard): Overview ROI dashboard (KPIs, funnel, timeseries, top products, recent)`

### Task A8: Phase A gate + docs
- [ ] `apps/dashboard/README.md` (run, data layer, design-system note), root README + memory status,
      `docs/DECISIONS.md` D27–D31. `pnpm lint && typecheck && build && test` green.
- [ ] commit `docs(dashboard): Phase A — app shell + Overview + analytics/credits API`
- [ ] **PAUSE for review.**

---

## Phase B — Configure (outline; expand at execution)
- Widget Settings: settings form (button/theme/locale/result-CTA/branding) + **persistent live preview**
  (Button → Modal → Result states, reacts to accent/mode/radius/text/CTA/watermark) — port the prototype's
  `.wp-*` preview. Merchant API `GET/PUT /v1/widget-config` (service + Zod, reuse `WidgetConfigResponse`).
- Script & Install: one-line snippet + copy, framework tabs (Shopify/WordPress/custom), allowed-domains
  manager (reuse M1 `/domains`), per-domain install status, "test install" tool.
- Onboarding wizard (5 steps: domains → script → products → customize+preview → install-detected) with
  progress + skip; reuses widget-config + domains + products.
- Tasks TDD the services + the pure preview-state/validation logic; commit per screen; **pause for review**.

## Phase C — Catalog & results (outline)
- Products: list (search/category/status, paginated), add/edit drawer (name/category/image/dimensions/SKU),
  CSV import (papaparse) with column mapping + validation results. API `GET/POST/PUT/DELETE /v1/products` +
  `POST /v1/products/bulk` (services + Zod + RLS, reuse `ProductInput`).
- Generations gallery: masonry/grid (before/after, product, date, status, 👍/👎), filters, detail view with
  full before/after slider + metadata. API `GET /v1/generations` (+ `:id`).
- Analytics: funnel-over-time, per-product, success/failure, device split, busiest times (Recharts) over the
  analytics endpoints.
- Tasks TDD services + pure CSV-mapping/validation; commit per screen; **pause for review**.

## Phase D — Money & account (outline)
- Credits & Billing: balance + "what's a credit", plan cards (Free/Starter/Growth/Scale/Enterprise) with
  current-plan highlight, usage meter, ledger table, invoices, manage-billing (reuse M1 checkout/portal),
  low-credit banner. API `GET /v1/billing/plans` (+ reuse `/credits`, checkout/portal).
- Settings: team & roles (Owner/Admin/Member), API keys (reveal-once + revoke, reuse M1 `/keys`), domains,
  account, danger zone. Auth reskin (premium split layout) + polished 404 + toasts throughout.
- Tasks TDD services; commit per screen; **final M4 review.**

---

## Self-review (Phase A)
- Spec coverage: app shell + nav + merchant switcher + Test/Live (§M4 global) → A6; Overview/ROI (KPIs +
  funnel + timeseries + top products + recent) → A7; analytics + credits API (§6.3) → A4,A5; design tokens
  from packages/ui → A1. ✓
- HARD RULES: merchant-scoped queries + RLS on every analytics/credits read (A4,A5); Zod I/O envelopes;
  no secrets/DB in the dashboard (HTTP + session, D28); types from `packages/shared`. ✓
- Credential-gated: live Supabase session across app↔api in prod; covered by Testcontainers (RLS services)
  + happy-dom render smokes + the existing dashboard auth wiring.
- Placeholder scan: none — each task names files, behaviors, tests. Naming consistent
  (`getCreditsView`, `summary`/`timeseries`, `NAV_ITEMS`, `buildFunnel`, `compact`/`delta`).
```

# @lumina/dashboard

Merchant control plane (Next.js 15 App Router). The premium, pixel-faithful dashboard built on the
LUMINA design system (`@lumina/ui`). M1 wired **Supabase Auth**; **M4** builds the app shell + screens.

## Run

```bash
cp .env.example .env   # NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, API_URL, APP_URL
pnpm -F @lumina/dashboard dev   # http://localhost:3000  (needs @lumina/api on :3001)
pnpm -F @lumina/dashboard test  # vitest — pure logic (format, funnel, shell helpers)
```

## Architecture

- **Design system (D27):** `import '@lumina/ui/styles.css'` (tokens + components + app shell, ported
  verbatim) in the root layout; screens use the prototype's class names (`.card`, `.kpi`, `.table`,
  `.side`, `.topbar`…) for fidelity. Charts use **Recharts** styled with the `--viz-*` tokens; KPI
  sparklines + the funnel are inline SVG (D30).
- **Data layer (D28):** server components/actions call the **merchant API** in `@lumina/api` over HTTP via
  `src/lib/api.ts`, which forwards the Supabase session cookie and validates responses with shared Zod
  schemas. No DB access or secrets in the dashboard.
- **Shell:** the `(app)` route group gates the session, provisions the merchant on first login, and renders
  `Sidebar` (merchant switcher, grouped nav, credit pill, account) + `Topbar` (route-derived title,
  Test/Live env toggle, theme toggle, notifications, account). Theme (light/dark via `:root[data-theme]`)
  + env live in a thin client provider (D31).

## Screens

| Status | Screen | Notes |
|---|---|---|
| ✅ M4·A | **Overview** | ROI dashboard — KPIs (+ deltas, sparklines), conversion funnel, generations/CTA timeseries, top products, recent strip. |
| ✅ M4·B | **Widget Settings** | Theme/copy/CTA/branding form with a self-contained live preview (button · modal · result), saved to `/v1/widget-config`. Result-CTA fields autopopulate from platform presets (Shopify/WooCommerce/Wix/generic, `lib/platforms.ts`). |
| ✅ M4·B | **Script & Install** | Platform picker landing (generic script live; WordPress/Shopify/WooCommerce/Wix/Squarespace "coming soon") → env-aware loader `<script>` + trigger-button snippets with copy + verify checklist. |
| ✅ M4·B | **Onboarding** | 5-step guided checklist; completion derived from live signals (config, products, install, generations). |
| ✅ M4·C | **Products** | Catalog table with search/category filter, add/edit drawer, CSV import (client-parsed, per-row errors); soft-delete archive. |
| ✅ M4·C | **Generations** | Status-filtered card gallery, cursor "Load more", before/after wipe detail with run metadata. |
| ✅ M4·C | **Analytics** | Range selector (7/30/90d) over the Phase-A analytics API — KPIs, funnel, timeseries, top products. |
| ✅ M4·D | **Credits & Billing** | Credit meter, plan cards (upgrade → Stripe Checkout, manage → portal), credit ledger. |
| ✅ M4·D | **Settings** | Account rename, reveal-once API keys, allowed domains, team list, honest danger zone. |
| ✅ M4·D | **Auth + 404** | Reskinned login (email/password + Google) and a branded not-found page. |

## Status

**M4 complete** — all screens built. Pure logic (formatting, funnel, shell, CSV, slider, plan helpers) is
unit-tested; the merchant API behind the screens (`/credits`, `/analytics/*`, `/widget-config`, `/products*`,
`/generations*`, `/billing/plans`, `/team`, `/merchant`) is covered by `@lumina/api` Testcontainers tests.
The live flow needs a real Supabase project + the API running.

> M4 build runs `tsc --noEmit`; `next build` + font optimization (next/font) land in M5.

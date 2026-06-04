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
  Test/Live env toggle, theme toggle, search). Theme (light/dark via `:root[data-theme]`) + env live in a
  thin client provider (D31).

## Screens

| Status | Screen | Notes |
|---|---|---|
| ✅ M4·A | **Overview** | ROI dashboard — KPIs (+ deltas, sparklines), conversion funnel, generations/CTA timeseries, top products, recent strip. |
| ✅ M4·B | **Widget Settings** | Theme/copy/CTA/branding form with a self-contained live preview (button · modal · result), saved to `/v1/widget-config`. |
| ✅ M4·B | **Script & Install** | Env-aware loader `<script>` + trigger-button snippets with copy + verify checklist. |
| ✅ M4·B | **Onboarding** | 5-step guided checklist; completion derived from live signals (config, products, install, generations). |
| ⏳ M4·C | Products · Generations gallery · Analytics | catalog + CSV import, before/after gallery, deeper charts. |
| ⏳ M4·D | Credits & Billing · Settings · Auth reskin | plan cards, ledger, team/keys/domains/danger zone. |

## Status

Logic (formatting, funnel, shell helpers) is unit-tested; the merchant API behind the screens
(`/credits`, `/analytics/*`) is covered by `@lumina/api` Testcontainers tests. The live flow needs a real
Supabase project + the API running.

> M4 build runs `tsc --noEmit`; `next build` + font optimization (next/font) land in M5.

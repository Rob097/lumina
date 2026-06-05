# Vercel setup (two projects from one monorepo)

> Runbook only — run during the deploy session with the `vercel` CLI (HARD RULE #10).

LUMINA deploys as **two Vercel projects** from this Turborepo, each with a different **Root Directory**:

| Project | Root Directory | Domain | Notes |
|---|---|---|---|
| `lumina-api` | `apps/api` | `api.lumina.app` | Public widget API + merchant API + `/internal/inngest` serve endpoint. |
| `lumina-dashboard` | `apps/dashboard` | `app.lumina.app` | Merchant control plane (Next.js App Router). |

Build/runtime config lives in each app's `vercel.json` (build runs `next build` via `build:next`; the local
`build` script stays `tsc --noEmit` for the quality gate). pnpm + the workspace are restored with
`pnpm install --frozen-lockfile` from the repo root.

## Link + configure (per project)

```bash
# from the repo root, once per project:
vercel link --project lumina-api          # choose Root Directory: apps/api
vercel link --project lumina-dashboard    # choose Root Directory: apps/dashboard
```

## Environment variables

Set the subset each app needs from `.env.example` via `vercel env add` (or the dashboard). Minimum:

- **lumina-api**: `DATABASE_URL`, `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL/TOKEN`,
  `R2_*`, `FAL_KEY` (+ `FAL_MODEL_*`/`FAL_COST_*`), `INNGEST_EVENT_KEY/SIGNING_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `RESEND_API_KEY`, `SENTRY_DSN`, `AXIOM_TOKEN/DATASET`,
  `APP_URL`, `API_URL`, `CDN_URL`, `RETENTION_DAYS/CRON`.
- **lumina-dashboard**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CDN_URL`,
  `API_URL` (→ `https://api.lumina.app`), `APP_URL`.

Secrets are **server-only** (HARD RULE #2) — the only `NEXT_PUBLIC_*` values are the Supabase URL/anon key
and the CDN base. Never expose service-role keys, Stripe secrets, or R2 credentials to the client.

## Inngest

After the api project is live, register the serve endpoint in Inngest Cloud:
`https://api.lumina.app/internal/inngest`. Inngest runs the `generation-requested` workflow **and** the
`retention-purge` cron (both registered in `apps/api/src/app/internal/inngest/route.ts`) — no Vercel Cron needed.

# LUMINA — deployment guide

> **Provision with the vendor CLIs, never by hand-editing dashboards** (HARD RULE #10): `supabase`,
> `vercel`, `wrangler`, `stripe`, `inngest`, `gh`. Schema changes go **only** through Drizzle migrations
> (HARD RULE #4). Secrets live in each vendor's env store; `.env*` is never committed.

This is the runbook. The infra config lives in [`infra/`](../infra/README.md). Topology + env var names are
in [`infra/README.md`](../infra/README.md) and [`.env.example`](../.env.example).

## 0. Prereqs (once)

```bash
nvm use                       # Node 20.19.0
pnpm install                  # restore the workspace
pnpm lint && pnpm typecheck && pnpm test   # green gate before any deploy
corepack prepare pnpm@9.15.4 --activate
# CLIs: supabase, vercel, wrangler, stripe, inngest, gh (logged in)
```

## 1. Supabase (DB + Auth + Realtime)

```bash
supabase projects create lumina-staging          # or use an existing project ref
supabase link --project-ref <ref>
# Apply schema via Drizzle migrations (NOT supabase db push of ad-hoc SQL):
DATABASE_URL=<pooled-conn> pnpm db:migrate
DATABASE_URL=<pooled-conn> pnpm db:seed           # optional demo merchant/keys/products
```

- Enable **Email** + **Google** auth providers; set the dashboard redirect URLs (`app.lumina.app/auth/callback`).
- Verify RLS + advisors (read-only): use the Supabase MCP `get_advisors` / `list_tables` — **never mutate** with it.

## 2. Cloudflare (R2 + CDN + WAF)

Follow [`infra/cloudflare/README.md`](../infra/cloudflare/README.md): create `lumina-prod` + `lumina-cdn`
buckets, deploy the widget CDN Worker, enable image-resizing, add the WAF/rate rules.

```bash
pnpm -F @lumina/widget build                      # produces dist/widget.js + widget.<hash>.js
wrangler r2 object put lumina-cdn/widget.js --file apps/widget/dist/widget.js
wrangler r2 object put lumina-cdn/widget.<hash>.js --file apps/widget/dist/widget.<hash>.js
cd infra/cloudflare && wrangler deploy             # the loader Worker
```

## 3. Stripe (billing)

```bash
stripe products create … && stripe prices create …   # one price per paid plan
# set STRIPE_PRICE_STARTER/GROWTH/SCALE in the api env (PLAN_CATALOG resolves price → plan)
stripe listen --forward-to https://api.lumina.app/api/v1/webhooks/stripe   # capture STRIPE_WEBHOOK_SECRET
```

## 4. Upstash · fal.ai · Resend · Sentry · Axiom

Create each resource, copy credentials into the api Vercel env (`UPSTASH_*`, `FAL_KEY`, `RESEND_API_KEY`,
`SENTRY_DSN`, `AXIOM_TOKEN`/`AXIOM_DATASET`). With these unset the app degrades safely (no-op rate limiter,
mock AI, console event sink) — so staging can come up incrementally.

## 5. Vercel (api + dashboard)

Follow [`infra/vercel/README.md`](../infra/vercel/README.md): two projects, set env, then:

```bash
vercel deploy --prod   # from apps/api      → api.lumina.app
vercel deploy --prod   # from apps/dashboard → app.lumina.app
```

## 6. Inngest

Register `https://api.lumina.app/internal/inngest` in Inngest Cloud. Confirm the `generation-requested`
function and the `retention-purge` cron appear. Set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` in the api env.

## 7. Smoke test (staging)

- `curl https://api.lumina.app/api/v1/healthz` → `200`.
- Load `apps/widget/test-store.html` against staging (real `site_key`, allow-listed domain) → run one
  generation end-to-end; confirm a result + a debited credit + a `generation.finished` event in Axiom.
- Sign in to `app.lumina.app`, confirm Overview/Generations populate.

See [`release-checklist.md`](./release-checklist.md) before promoting staging → production.

# LUMINA — Setup

## 1. Local toolchain

| Tool | Version | Notes |
|---|---|---|
| Node | 20+ (pinned `20.19.0` in `.nvmrc`) | `nvm install && nvm use` |
| pnpm | 9 (`9.15.4`) | `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| Docker | any recent | required for `@lumina/db` integration tests (Testcontainers Postgres) |

```bash
nvm use
pnpm install
pnpm build
pnpm test            # unit (shared) + Postgres integration (db) — Docker must be running
pnpm lint && pnpm typecheck
```

## 2. Database (local)

The DB package proves the schema, RLS, and `debit_credits()` against a **real Postgres** started by
Testcontainers — no cloud project is needed to run the tests:

```bash
pnpm -F @lumina/db test
```

To run migrations / seed against your own Postgres (or Supabase), set `DATABASE_URL` and:

```bash
cp packages/db/.env.example packages/db/.env   # set DATABASE_URL
pnpm db:migrate                                 # apply drizzle migrations (incl. RLS + functions)
pnpm db:seed                                    # demo merchant + keys + products + credit grant
```

> The seed inserts a row into `auth.users` directly (fine for local dev). On a real Supabase project
> the owner user is created through Supabase Auth; the seed will then attach the merchant to it.

> Schema changes happen **only** through Drizzle migrations: edit `packages/db/src/schema.ts`, run
> `pnpm db:generate`, and hand-author non-table objects (RLS/policies/functions) as a custom migration
> (`pnpm exec drizzle-kit generate --custom`). Never apply ad-hoc SQL. The Supabase MCP is read-only.

## 3. External accounts to create (provisioning happens in later milestones via vendor CLIs)

| Service | Used for | Env vars |
|---|---|---|
| **Supabase** | Postgres + Auth + Realtime + Storage glue | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` |
| **Vercel** | Dashboard + API hosting + Inngest endpoint | (project link) |
| **Cloudflare** | R2 object storage + CDN + image resize + WAF | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE` |
| **Upstash** | Redis: rate limit / idempotency / cache / anon caps | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| **fal.ai** | AI image gateway (Nano Banana Pro / FLUX.2) | `FAL_KEY` |
| **Stripe** | Billing (Checkout, Portal, metered overage, webhooks) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Resend** | Transactional email | `RESEND_API_KEY` |
| **Sentry** | Error tracking (widget/dashboard/api/workflow) | `SENTRY_DSN`, `PUBLIC_SENTRY_DSN` |
| **Axiom** | Structured logs + usage events | `AXIOM_TOKEN`, `AXIOM_DATASET` |
| **Better Stack** | Uptime + status page | (dashboard) |
| **Inngest** | Durable AI workflow | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` |

Copy `.env.example` → `.env` at the root and per app, and fill in. `.env*` is git-ignored; keep
`.env.example` current as new variables are introduced.

## 4. CI

`.github/workflows/ci.yml` runs lint + typecheck + build, then the db integration tests against a
Postgres service container (`TEST_DATABASE_URL`), on Node 20 with pnpm.

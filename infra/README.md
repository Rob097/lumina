# infra/ — LUMINA deployment topology (IaC notes)

> **Nothing here deploys on its own.** These are configuration files + runbooks. The actual provisioning
> is done with the vendor CLIs (HARD RULE #10) during the deploy session — see [`docs/deploy.md`](../docs/deploy.md).

## Topology

```
                         ┌────────────────────────── Cloudflare ──────────────────────────┐
  shopper browser ──▶ cdn.lumina.app/widget.js  (Worker → R2, immutable cache)             │
                     cdn.lumina.app/cdn-cgi/image/…  (image-resizing for result thumbs)     │
                     R2 buckets: rooms/ products/ results/  (merchant-prefixed keys)        │
                     WAF + rate rules in front of api.lumina.app/v1/widget/*                │
                         └────────────────────────────────────────────────────────────────┘
        merchant browser ──▶ app.lumina.app   (Vercel · @lumina/dashboard, Next.js)
        widget / dashboard ─▶ api.lumina.app  (Vercel · @lumina/api, Next.js route handlers
                                               + /internal/inngest serve endpoint + retention cron)
        api ──▶ Supabase (Postgres + Auth + Realtime) · Upstash Redis · fal.ai · Stripe · Resend
        api ──▶ Sentry (errors) · Axiom (ops/usage events)
        Inngest Cloud ──▶ api.lumina.app/internal/inngest  (durable generation workflow + retention)
```

## What's in here

| Path | Purpose |
|---|---|
| `cloudflare/wrangler.toml` | Worker that serves the immutable `widget.js` loader from the R2 bucket with year-long caching. |
| `cloudflare/README.md` | R2 buckets, custom domains, image-resizing, and WAF/rate-rule setup (CLI + dashboard steps). |
| `vercel/README.md` | The two Vercel projects (dashboard + api), root dirs, env, and build commands. |
| `../apps/dashboard/vercel.json`, `../apps/api/vercel.json` | Per-project Vercel build/runtime config. |

## Environments

- **staging** — `*.staging.lumina.app`, Supabase staging project, Stripe test mode, `AI_PROVIDER=mock` allowed.
- **production** — `*.lumina.app`, Supabase prod, Stripe live, fal.ai live.

Secrets live only in each vendor's env store (Vercel env, Cloudflare secrets, Inngest). `.env*` is never
committed; `.env.example` is the source of truth for variable names.

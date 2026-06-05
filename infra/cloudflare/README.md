# Cloudflare setup (R2 · CDN · image-resizing · WAF)

> Runbook only — run these during the deploy session. Uses the `wrangler` CLI (HARD RULE #10).

## 1. R2 buckets

```bash
wrangler r2 bucket create lumina-prod    # private: rooms/ products/ results/  (merchant-prefixed keys)
wrangler r2 bucket create lumina-cdn     # public-ish: the widget bundles served by the Worker
```

Object key layout (set by `apps/api/src/lib/storage/keys.ts`): `rooms/{merchant_id}/…`,
`products/{merchant_id}/…`, `results/{merchant_id}/…`. **Tenant isolation depends on this prefix**
(HARD RULE #1) — never write an object without the `{merchant_id}/` prefix.

Create an R2 **S3 API token** (Account → R2 → Manage API Tokens) and set
`R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET=lumina-prod` in the API's Vercel env.

## 2. Widget CDN

`cdn.lumina.app` is fronted by the `lumina-widget-cdn` Worker (see `wrangler.toml` / `worker.js`), which
serves `widget.js` + the content-hashed app bundle from the `lumina-cdn` bucket with immutable caching.
Set `R2_PUBLIC_BASE=https://cdn.lumina.app` so result thumbnails resolve.

## 3. Image resizing

Enable **Image Resizing** on the `lumina.app` zone (Speed → Optimization). The API builds
`https://cdn.lumina.app/cdn-cgi/image/width=…/results/{merchant_id}/…` URLs (`R2Storage.resizeUrl`) for the
dashboard gallery + widget thumbnails. The `results/` objects must be reachable by the resizing pipeline
(serve them through a Worker/route bound to `lumina-prod`, or a signed-URL origin).

## 4. WAF + rate rules

In front of `api.lumina.app/api/v1/widget/*` (the public, unauthenticated surface):

- **Rate limiting rule**: cap requests per client IP (e.g. 120/min) — defense-in-depth on top of the
  Upstash per-`site_key` + per-anon caps already enforced in the app (`apps/api/src/lib/ratelimit.ts`).
- **Managed WAF**: enable the Cloudflare OWASP core ruleset; allow the widget endpoints' expected methods
  (`GET`, `POST`, `OPTIONS`) and `Origin` preflights.
- **Bot Fight Mode**: on for the API zone; the widget endpoints are CORS- + `site_key`-gated.

## 5. DNS

| Record | Target |
|---|---|
| `app.lumina.app` (CNAME) | Vercel (dashboard project) |
| `api.lumina.app` (CNAME) | Vercel (api project) |
| `cdn.lumina.app` (Worker route) | `lumina-widget-cdn` Worker |

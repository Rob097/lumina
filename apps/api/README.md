# @lumina/api

Public widget API + merchant API + (later) the Inngest endpoint. Next.js 15 App Router, Node runtime.
Route handlers are thin wrappers over framework-agnostic, unit/integration-tested modules in `src/lib`.

## Run

```bash
cp .env.example .env        # DATABASE_URL, SUPABASE_*, STRIPE_*
pnpm -F @lumina/api dev      # http://localhost:3001
pnpm -F @lumina/api test     # unit + Testcontainers integration (Docker required)
```

## Auth types (§6.1)

- **PUBLISHABLE** — `site_key` (`pk_…`) via `X-Lumina-Key` header or `?site_key`; Origin-checked against
  the merchant's allowed domains, CORS limited to those domains. (`resolveByPublishableKey`)
- **SECRET** — `Authorization: Bearer sk_…` for server-to-server. (`resolveBySecretKey`)
- **SESSION** — Supabase Auth cookie (via `@supabase/ssr`), used by the dashboard endpoints.

Keys are stored as `sha256(raw)` + a lookup `prefix`; the raw key is shown once on creation.

## Endpoints (M1)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/healthz` | — | liveness |
| GET | `/api/v1/me` | session | user + merchant memberships |
| POST | `/api/v1/auth/bootstrap` | session | idempotent first-login provisioning |
| GET / POST | `/api/v1/keys` | session | list / create (reveal-once) |
| DELETE | `/api/v1/keys/:id` | session | revoke (tenant-scoped) |
| GET / PUT | `/api/v1/domains` | session | allowed-domains list |
| GET | `/api/v1/notifications` | session | member's notifications + unread count |
| POST | `/api/v1/notifications/read` | session | mark `{ ids }` or `{ all: true }` read |
| GET / PUT | `/api/v1/notification-prefs` | session | per-member channel toggles |
| POST | `/api/v1/billing/checkout` | session | Stripe Checkout URL `{ plan }` |
| POST | `/api/v1/billing/portal` | session | Stripe Customer Portal URL |
| POST | `/api/v1/webhooks/stripe` | signature | plan + credit grant; `invoice.payment_failed` → notify |

### Public widget API (M2, PUBLISHABLE key + Origin/CORS)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/widget/config` | theme/buttonText/locale/i18n/watermark/limits/resultCta |
| POST | `/api/v1/widget/sign-upload` | presigned R2 PUT → `{ uploadUrl, roomKey, expiresIn }` |
| POST | `/api/v1/widget/generate` | rate-limit + anon cap → debit + queue, or cached result (0 credits); `402` insufficient |
| GET | `/api/v1/widget/status/:id` | polling fallback (signed result/before URLs) |
| POST | `/api/v1/widget/feedback` | 👍/👎 → usage_event (`204`) |
| POST | `/api/v1/widget/event` | impression/open/cta beacon → usage_event (`204`) |
| GET/POST/PUT | `/internal/inngest` | Inngest serve endpoint |

All responses use the standard envelope on error:
`{ "error": { "code", "message", "requestId" } }` with the correct HTTP status.

## Generation pipeline (M2)

`POST /widget/generate` resolves the product, computes an idempotency key
(`sha256(merchant|product|room|hint)`), returns an identical succeeded result for **0 credits**, else
`debit_credits` (1) + inserts a `queued` generation + sends `generation.requested` to Inngest — all atomic.

The Inngest workflow (`generation.requested`, per-merchant + global concurrency caps) runs
`processGeneration`: `processing` → `AIOrchestrator.compose()` (the single model entrypoint;
policy-routed with retry + provider fallback) → store to R2 → finalize (`succeeded`, cost/latency/model +
result asset + usage_event). **Terminal failure refunds the credit** (`grant_credits(...,'refund')`) — we
never bill a failed generation.

```bash
pnpm -F @lumina/api e2e   # offline end-to-end (mock provider + Testcontainers DB): generate → workflow → cache
```

## Billing

`POST /webhooks/stripe` verifies the signature, normalizes the event (`toBillingEvent`), and applies it
(`applyBillingEvent`): upsert subscription, set plan, and `grant_credits()` the plan's included credits —
all in one transaction, deduped on `webhooks_inbox.id` so replays never double-grant. Plan ↔ price is
configured via `STRIPE_PRICE_<TIER>` env vars; included credits come from `PLAN_CATALOG` in `@lumina/shared`.

> M1 build runs `tsc --noEmit` (fast type-gate). The full `next build` + deploy config lands in M5.

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
| GET / POST | `/api/v1/clients` | session | Studio client list (#8) — list / create. `?withStats=true` adds render count + last activity (rubric/overview) |
| GET / PUT / DELETE | `/api/v1/clients/:id` | session | fetch / update / delete (tenant-scoped) |
| POST | `/api/v1/uploads/sign` | session | authed presigned R2 room upload (Studio) |
| POST | `/api/v1/generations` | session | Studio generate — reuses `createGeneration`, debits 1 credit, optional `clientId`. Accepts `productIds[]` (1–5; multi-product → one combined render; legacy single `productId` still accepted) |
| POST | `/api/v1/generations/:id/email` | session | email a finished render (7-day signed link) to the client |
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
`processGeneration`: `processing` → moderate input → **two pre-passes in parallel** — (a) **resolve the
product image** (a background-removed **cutout** — `BG_REMOVAL_PROVIDER`: `gateway` (Gemini on the AI
Gateway, the Vercel-only default) or `replicate` (a true matting model) — computed once and cached on
`products.clean_image_key` (eagerly on product create/bulk via the `product.image.process` Inngest
function, else lazily here); best-effort — degrades to the raw image, D63) and (b) **scene analysis**
(a cheap vision pass returning per-image facts — lighting, surfaces, tilt, scale, placement region; fed
to compose, low-confidence dropped; best-effort, D64) → **normalize the room** (deskew by the scene's
tilt, clamped + inscribed-rect crop, plus a dark-photo auto-level; stored back; best-effort, D65) →
**`AIOrchestrator.compose()`** (the single model entrypoint; policy-routed with retry +
provider fallback). The compose call pins the **output aspect
ratio to the uploaded room** + 2K (`providerOptions.google.imageConfig`) and feeds the product's real
dimensions, so the model can't re-frame/rotate or misjudge scale. Then the **pixel-perfect step**
(`keepOnlyProductChange`): diff the render against the original to find where the product (and its
shadows) actually changed, and **composite only that region back over the normalized room** — so every
pixel outside the product is byte-identical to that room (a too-small/large change keeps the full render).
→ moderate output → store to R2 → **coverage-quantity estimate** (#7, best-effort; never fails the
generation) → finalize (`succeeded`, cost/latency/model + result asset + usage_event +
`suggested_quantity`/`quantity_rationale`). **Terminal failure refunds the credit**
(`grant_credits(...,'refund')`) — we never bill a failed generation. The compositor prompt is a single
editable master prompt in [`packages/ai/src/prompts/`](../../packages/ai/src/prompts) (interior **and**
exterior; the model infers the product's placement archetype itself).

```bash
pnpm -F @lumina/api e2e   # offline end-to-end (mock provider + Testcontainers DB): generate → workflow → cache
```

## Billing

`POST /webhooks/stripe` verifies the signature, normalizes the event (`toBillingEvent`), and applies it
(`applyBillingEvent`): upsert subscription, set plan, and `grant_credits()` the plan's included credits —
all in one transaction, deduped on `webhooks_inbox.id` so replays never double-grant. Plan ↔ price is
configured via `STRIPE_PRICE_<TIER>` env vars; included credits come from `PLAN_CATALOG` in `@lumina/shared`.

> M1 build runs `tsc --noEmit` (fast type-gate). The full `next build` + deploy config lands in M5.

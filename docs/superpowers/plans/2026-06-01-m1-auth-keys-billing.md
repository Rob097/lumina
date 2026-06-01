# M1 — Auth, Tenants, API Keys, Billing Skeleton — Implementation Plan

> **For agentic workers:** TDD each task (tests fail first). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A merchant can register (Supabase Auth), get bootstrapped (merchant + owner membership + four
key pairs + default widget config), manage API keys (reveal-once + revoke) and allowed domains, and
complete a Stripe test checkout that grants credits via an idempotent webhook — with the public API
gated by `site_key` + Origin/CORS.

**Architecture:** `apps/api` becomes a real Next.js 15 App Router app hosting `/api/v1/*` route handlers
(Node runtime). All non-trivial logic lives in framework-agnostic modules under `apps/api/src/lib/*`
(crypto, auth resolvers, CORS, key service, billing, bootstrap) so it is unit/integration testable
without booting Next. `apps/dashboard` wires Supabase Auth (email/password + Google) and triggers
bootstrap on first login. DB integration tests reuse a shared Testcontainers harness exported from
`@lumina/db/testing`.

**Tech Stack (add to M0):** next@15 + react@19 · @supabase/supabase-js + @supabase/ssr · stripe ·
@lumina/db, @lumina/shared · vitest (unit + Testcontainers integration).

---

## Decisions (append to docs/DECISIONS.md)
- **D9 — Server logic lives in `apps/api/src/lib`, route handlers are thin.** Keeps auth/keys/billing
  unit-testable without Next. No new `core` package (architecture defines only shared/db/ai/ui).
- **D10 — Reusable test harness exported as `@lumina/db/testing`.** The M0 Testcontainers+auth-shim
  harness moves to `packages/db/src/testing.ts` (separate build entry; `testcontainers` stays a devDep)
  so api/db (and later M2) share one integration-test setup.
- **D11 — Key format `^(pk|sk)_(test|live)_<base64url-secret>$`.** Store only `sha256(raw)` + a `prefix`
  (`<tag>_<env>_<first8>`) for O(1) lookup; constant-time hash compare on verify; raw revealed once.
- **D12 — Plan catalog in `@lumina/shared`.** `PLAN_CATALOG` maps `plan_tier` → `{ includedCredits,
  stripePriceEnvVar, ... }`. Stripe webhook resolves price→plan→credits from this table (no magic numbers).
- **D13 — Credit grants are atomic + idempotent.** A `grant_credits(merchant, amount, reason, stripe_ref)`
  SQL function mirrors `debit_credits` (bump cache + append ledger in one tx). Stripe webhooks dedupe on
  `webhooks_inbox(id)` so replays never double-grant.

---

## File structure

```
apps/api/
  package.json  next.config.mjs  tsconfig.json  vitest.config.ts  .env.example  README.md
  src/
    app/api/v1/
      me/route.ts
      keys/route.ts        keys/[id]/route.ts
      domains/route.ts
      billing/checkout/route.ts   billing/portal/route.ts
      webhooks/stripe/route.ts
      healthz/route.ts
    lib/
      http.ts            # error envelope, requestId, json helpers (uses @lumina/shared)
      cors.ts            # origin allow-list + CORS headers + preflight
      keys.ts            # pure: generateApiKey/hashApiKey/parseKey/safeEqual
      key-service.ts     # db: createKey/listKeys/verifyKey/revokeKey
      auth.ts            # resolveByPublishableKey/SecretKey/Session
      supabase.ts        # server supabase clients (service role + ssr)
      bootstrap.ts       # first-login: merchant+membership+keys+widget_config
      billing/stripe.ts  # stripe client + plan catalog mapping
      billing/webhook.ts # verify + idempotent handle(event) -> grant/plan updates
    test/ (integration specs)
packages/db/
  src/testing.ts         # exported Testcontainers harness (D10)
  drizzle/0002_grant_credits.sql   # grant_credits() function (D13)
apps/dashboard/           # Supabase Auth wiring + first-login bootstrap call
```

---

## Tasks (TDD order)

### Task 1: Shared — plan catalog + key/domain schemas
- [ ] `@lumina/shared`: `PLAN_CATALOG` (Record<PlanTier,{includedCredits:number; label:string}>),
      `ApiKeySummarySchema` (`{id,kind,env,prefix,lastUsedAt,revokedAt}`), `CreateKeyRequestSchema`
      (`{kind,env}`), `CreateKeyResponseSchema` (`{id,key}`), `DomainsSchema` (`{domains:string[]}` with
      hostname validation), `MeResponseSchema`. Tests first.
- [ ] commit `feat(shared): plan catalog + api-key/domain/me schemas`

### Task 2: db — `grant_credits()` + shared test harness
- [ ] custom migration `0002_grant_credits.sql`: `grant_credits(p_merchant uuid,p_amount int,
      p_reason ledger_reason,p_ref text)` — bump `credits_balance`, append ledger row, return balance.
- [ ] move harness to `src/testing.ts`; export via `"./testing"`; tsup entry; tests still green.
- [ ] integration test: `grant_credits` adds credits + ledger row; sum == cache.
- [ ] commit `feat(db): grant_credits() and shared @lumina/db/testing harness`

### Task 3: api — pure key crypto (no DB, no Next)
- [ ] `lib/keys.ts`: `generateApiKey(kind,env)`, `hashApiKey(raw)`, `parseKey(raw)` (→ {tag,env} or null),
      `safeEqual(a,b)` (timing-safe). Tests: round-trip hash deterministic; parse rejects malformed;
      prefix is `<tag>_<env>_<first8>`; safeEqual true/false.
- [ ] commit `feat(api): api-key crypto primitives`

### Task 4: api — key service (db) + verify
- [ ] `lib/key-service.ts`: `createKey(db,{merchantId,kind,env})` → persists hash+prefix, returns raw once;
      `listKeys(db,merchantId)`; `verifyKey(db,raw)` → {merchantId,key} | null (prefix lookup +
      safeEqual + not revoked + bump last_used_at); `revokeKey(db,merchantId,id)`.
- [ ] integration tests (Testcontainers): create→verify round-trip; wrong/revoked key fails; tenant scoping.
- [ ] commit `feat(api): api-key service with hashed storage + reveal-once`

### Task 5: api — CORS + auth resolvers
- [ ] `lib/cors.ts`: `isAllowedOrigin(origin, allowedDomains)` (hostname match incl. localhost),
      `corsHeaders(origin)`, preflight handler. Tests for allow/deny.
- [ ] `lib/auth.ts`: `resolveByPublishableKey(req,db)` (key valid + Origin∈allowed → {merchant} else
      invalid_key/domain_not_allowed), `resolveBySecretKey`, `resolveBySession`. Integration tests.
- [ ] commit `feat(api): CORS origin gate + publishable/secret/session resolvers`

### Task 6: api — Next app scaffold + keys/domains/me routes
- [ ] real Next 15 app (next.config, app dir, healthz). `lib/http.ts` error envelope.
- [ ] `/v1/keys` GET/POST, `/v1/keys/:id` DELETE; `/v1/domains` GET/PUT; `/v1/me` GET — session-auth'd.
- [ ] route-level tests calling the handlers with mocked session → asserting envelope + RLS scoping.
- [ ] commit `feat(api): keys, domains, and me route handlers`

### Task 7: api — bootstrap on first login
- [ ] `lib/bootstrap.ts`: `ensureMerchantForUser(db,{userId,email})` — idempotent; creates merchant
      (unique slug from email), owner membership, 4 key pairs, default widget_config. Integration tests
      (idempotent; second call no-ops).
- [ ] commit `feat(api): first-login merchant/keys bootstrap`

### Task 8: api — Stripe billing (checkout, portal, idempotent webhook)
- [ ] `lib/billing/stripe.ts`: stripe client + `planForPrice(priceId)` from env-configured price map.
- [ ] `lib/billing/webhook.ts`: `handleStripeEvent(db, event)` — dedupe via `webhooks_inbox`; on
      subscription create/update + invoice paid → upsert `subscriptions`, set `merchants.plan`, call
      `grant_credits(includedCredits, 'grant', event.id)`. Integration tests with synthetic events prove
      grant happens once and replays are no-ops.
- [ ] `/v1/billing/checkout` POST (session) → Stripe Checkout URL; `/v1/billing/portal` POST → portal URL;
      `/v1/webhooks/stripe` POST → signature verify + handle.
- [ ] commit `feat(api): stripe checkout/portal + idempotent credit-granting webhook`

### Task 9: dashboard — Supabase Auth + bootstrap trigger
- [ ] `@supabase/ssr` clients; login (email/password + Google) + callback; on session, call
      `ensureMerchantForUser`; minimal authed page showing balance + keys (full UI is M4).
- [ ] commit `feat(dashboard): supabase auth + first-login bootstrap`

### Task 10: README + gate
- [ ] `apps/api/README.md` (endpoints, auth types, env). Update root README status.
- [ ] full `pnpm lint && pnpm typecheck && pnpm build && pnpm test` green. commit `docs(api): readme + M1 close`

---

## Self-review
- Spec coverage (M1 prompt): Supabase Auth+bootstrap → T7,T9; key service+endpoints → T3,T4,T6;
  auth middleware (pk/sk/session)+CORS/Origin → T5; domains → T6; Stripe customer/checkout/portal/webhook
  → T8. ✓
- HARD RULES: secrets server-only (keys hashed, raw shown once); tenant scoping on every query; webhooks
  idempotent via `webhooks_inbox`; credits granted atomically; Zod on every I/O; error envelope. ✓
- Credential-gated (cannot run live without accounts): real Supabase Auth UI flow + live Stripe Checkout
  session. Logic is fully covered by unit + Testcontainers integration tests with synthetic Stripe events.
```

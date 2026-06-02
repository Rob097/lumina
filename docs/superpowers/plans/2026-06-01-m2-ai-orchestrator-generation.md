# M2 — AI Orchestrator + Generation Workflow (server only) — Implementation Plan

> **For agentic workers:** TDD each task (tests fail first). Steps use checkbox (`- [ ]`) syntax.

**Goal:** A scripted client uploads a room photo, posts `/v1/widget/generate`, and receives a composed
result URL; one credit is debited; a forced provider error proves retry → fallback → refund; an identical
re-request returns the cached result for free.

**Architecture:** `packages/ai` owns the provider-agnostic `AIOrchestrator.compose()` (routing policy +
retry/backoff + automatic fallback) — the ONLY place model calls happen (HARD RULE #8). `apps/api` adds an
R2 storage service, the public `/v1/widget/*` endpoints, and the Inngest `generation.requested` workflow
(validate → [bgRemoval] → [analyzeScene] → compose → moderate(+watermark) → store/finalize) with
refund-on-terminal-failure. External calls (fal.ai, R2, Inngest, Upstash, Axiom/Sentry) sit behind
interfaces so the orchestration is unit/integration-tested with mocks + Testcontainers.

**Tech Stack (add to M1):** `@fal-ai/client` · `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` ·
`inngest` · `@upstash/redis` + `@upstash/ratelimit`.

---

## Decisions (append to docs/DECISIONS.md)
- **D14 — `AIProvider` interface + `AIOrchestrator` own routing/retry/fallback.** `compose(ComposeInput)`
  is the single model entrypoint; swapping fal ↔ vertex ↔ replicate is one-file. Routing policy
  `quality|balanced|fast` maps to an ordered provider chain; retry with backoff then fall back.
- **D15 — `ImageRef = { url } | { bytes }`.** Providers fetch URLs; the orchestrator returns
  `{ bytes, model, costCents, latencyMs, width, height }` for margin/quality records.
- **D16 — R2 storage service in `apps/api/src/lib/storage`.** Keys are merchant-prefixed
  (`rooms|products|results/{merchant_id}/…`). Presigned PUT/GET via `@aws-sdk/s3-request-presigner`
  (computed offline → testable). Cloudflare image-resize URL helper for thumbnails.
- **D17 — Workflow = testable pure steps + thin Inngest wrapper.** Terminal failure → `status=failed`,
  `error_code`, and refund via `grant_credits(merchant, credits_spent, 'refund', generationId)` (reuses M1).
- **D18 — Idempotency key = `sha256(merchant_id|productRef|roomKey|placementHint)`** enforced by
  `gen_idem_uidx`; an identical recent succeeded generation is returned for **0 credits** (cache).
- **D19 — Every model + resolution is env-configured** (`FAL_MODEL_QUALITY/FAST`, `FAL_MODEL_BG_REMOVAL`,
  `FAL_MODEL_SCENE`, `GEN_RESOLUTION_*`).
- **D20 — Realtime via migration** adding `generations` to the `supabase_realtime` publication.

---

## File structure
```
packages/ai/
  package.json (deps: @fal-ai/client, zod, @lumina/shared)
  src/
    types.ts          # ComposeInput/Result, ImageRef, RoutingPolicy, SceneAnalysis, AIProvider
    prompt.ts         # buildComposePrompt (§7.5) + category guidance + negative guard
    orchestrator.ts   # AIOrchestrator: route(policy) -> retry(backoff) -> fallback; bgRemoval; analyzeScene
    providers/fal.ts        # FalProvider (Nano Banana Pro / FLUX.2) via @fal-ai/client, env models
    providers/vertex.ts     # stub (same interface, throws not_implemented)
    providers/replicate.ts  # stub
    providers/mock.ts       # deterministic provider for tests/local
    index.ts
  test/ prompt.test.ts, orchestrator.test.ts, scene.test.ts
apps/api/src/lib/
  storage/r2.ts       # keys, presigned PUT/GET, server put/get, resize URL
  storage/keys.ts     # roomKey/productKey/resultKey builders (merchant-prefixed)
  generate/idempotency.ts  # computeIdempotencyKey
  generate/service.ts      # createGeneration: cache-hit | debit + insert + enqueue
  inngest/client.ts        # Inngest client + event types
  inngest/generation.ts    # generation.requested function (steps) + pure step fns
  inngest/steps.ts         # validateInputs, finalizeSuccess, refundAndFail (testable)
  ratelimit.ts             # Upstash limiter + anon daily cap (interface + no-op fallback)
  observability.ts         # logUsageEvent (Axiom) + reportError (Sentry) behind interfaces
apps/api/src/app/api/v1/widget/
  config/route.ts  sign-upload/route.ts  generate/route.ts  status/[id]/route.ts
  feedback/route.ts  event/route.ts
apps/api/src/app/internal/inngest/route.ts   # Inngest serve endpoint
scripts/e2e-generate.ts
packages/db/drizzle/0003_realtime.sql
```

---

## Tasks (TDD order)

### Task 1: packages/ai — types + prompt (pure, TDD)
- [ ] `types.ts`: `RoutingPolicy`, `ImageRef`, `SceneAnalysis`, `ComposeInput`, `ComposeResult`,
      `AIProvider` (`name`, `compose(input)`), `BgRemovalProvider`, `SceneProvider`.
- [ ] `prompt.ts`: `buildComposePrompt(input)` filling §7.5 (hard rules, placement, scale, lighting,
      category guidance, negative guard). Tests: includes product/room rules, placement hint, category note.
- [ ] commit `feat(ai): compose types + structured prompt builder`

### Task 2: packages/ai — orchestrator (routing/retry/fallback, TDD with mocks)
- [ ] `orchestrator.ts`: `AIOrchestrator({ chains: Record<RoutingPolicy, AIProvider[]>, retries, backoffMs })`.
      `compose(input)`: try providers in the policy chain, each retried `retries`× with backoff; on
      exhaustion fall to the next provider; throw `AIComposeError` if all fail. `analyzeScene`, `bgRemoval`.
- [ ] `providers/mock.ts`: configurable success/fail provider.
- [ ] Tests: balanced picks primary; primary fails → retried then fallback succeeds; all fail → throws;
      records model/cost/latency.
- [ ] commit `feat(ai): AIOrchestrator routing, retry/backoff and provider fallback`

### Task 3: packages/ai — fal + stub providers
- [ ] `providers/fal.ts`: `FalProvider` mapping ComposeInput → `@fal-ai/client` multi-image edit; models
      from env. `providers/vertex.ts`, `providers/replicate.ts` stubs. `index.ts` barrel + factory
      `createOrchestratorFromEnv(env)`.
- [ ] commit `feat(ai): fal provider + vertex/replicate stubs + env factory`

### Task 4: apps/api — R2 storage service
- [ ] `storage/keys.ts`: `roomKey/productKey/resultKey(merchantId, id)` — always `{merchant_id}/`-prefixed.
- [ ] `storage/r2.ts`: `presignUpload(key, contentType)`, `getSignedUrl(key)`, `putObject`, `getObject`,
      `resizeUrl(key, opts)`. Tests (offline, dummy creds): keys are merchant-scoped; presigned URL is a
      valid https URL containing the key + `X-Amz-Signature`.
- [ ] commit `feat(api): R2 storage service (presigned upload/get, merchant-prefixed keys)`

### Task 5: apps/api — generate service core (TDD, Testcontainers)
- [ ] `generate/idempotency.ts`: `computeIdempotencyKey(parts)` (sha256 hex). Test deterministic + order.
- [ ] `generate/service.ts`: `createGeneration(db, deps, input)`:
      resolve product (registered or inline → cache image), compute idem key; if a succeeded generation
      with that key exists → return `{ generationId, status:'succeeded', resultUrl, cached:true }` (0 credits);
      else `debit_credits` → insert `generations(queued)` → `deps.enqueue(event)` → return `{queued}`.
      `INSUFFICIENT_CREDITS` → typed error.
- [ ] Tests: debit + insert + enqueue called; insufficient → throws, no row; cached identical → no debit,
      returns stored result.
- [ ] commit `feat(api): generate service — idempotency, cache-hit, atomic debit, enqueue`

### Task 6: apps/api — Inngest workflow + refund (TDD the step fns)
- [ ] `inngest/steps.ts`: `runValidate`, `runCompose` (calls orchestrator + stores result via R2),
      `finalizeSuccess(db, …)` (status=succeeded, result_key, cost/latency/model, usage_event),
      `refundAndFail(db, …)` (status=failed, error_code, `grant_credits(...,'refund',id)`).
- [ ] `inngest/generation.ts`: `generation.requested` fn wiring the steps with retries/timeouts +
      per-merchant + global concurrency caps; on terminal failure → `refundAndFail` + `reportError`.
- [ ] Tests (Testcontainers): finalizeSuccess sets fields + usage_event; refundAndFail restores balance
      (cache == ledger sum) and marks failed; a forced compose error path triggers refund.
- [ ] commit `feat(api): generation.requested workflow with refund-on-failure`

### Task 7: apps/api — widget endpoints + rate limit + observability
- [ ] `ratelimit.ts` (Upstash limiter + anon daily cap; no-op when unconfigured),
      `observability.ts` (Axiom usage log + Sentry report behind interfaces).
- [ ] Routes: `GET /v1/widget/config`, `POST /v1/widget/sign-upload`, `POST /v1/widget/generate`,
      `GET /v1/widget/status/:id`, `POST /v1/widget/feedback`, `POST /v1/widget/event`. All publishable-key
      + Origin/CORS gated (preflight `OPTIONS`); generate enforces rate limit + anon cap.
- [ ] `internal/inngest/route.ts` serve endpoint.
- [ ] commit `feat(api): public widget endpoints (config/sign-upload/generate/status/feedback/event)`

### Task 8: realtime + e2e script + docs + gate
- [ ] migration `0003_realtime.sql` (add `generations` to `supabase_realtime`).
- [ ] `scripts/e2e-generate.ts` (uses mock provider locally): sign-upload → PUT → generate → poll status →
      assert result URL + credit debited; second identical call → cached (0 credits).
- [ ] api README update; `pnpm lint && typecheck && build && test` green.
- [ ] commit `feat(api): realtime publication + e2e-generate script + M2 docs`

---

## Self-review
- Spec coverage (M2): orchestrator+providers+routing/retry/fallback+bg/scene → T1-T3; R2 → T4;
  sign-upload/generate/status/feedback/event + idempotency/cache/debit → T5,T7; Inngest workflow +
  refund + concurrency → T6; realtime + usage events + e2e → T8. ✓
- HARD RULES: all model calls via `AIOrchestrator.compose` (no provider SDK in handlers); never bill a
  failed generation (refund); debit before enqueue; merchant-prefixed R2 keys; Origin/CORS gate; Zod I/O. ✓
- Credential-gated (not runnable live): real fal.ai compose, real R2 PUT/GET, real Inngest run, Upstash.
  Covered by mocks + Testcontainers + offline presign; `scripts/e2e-generate.ts` runs against the mock
  provider + a Testcontainers DB.
```

# LUMINA — Claude Code Prompt (copy & paste)

> Paste the block below into **Claude Code** at the root of an empty directory. It treats Claude Code as the
> **lead engineer** and gives it an operational, milestone-ordered build plan. Keep the
> `LUMINA_Technical_Architecture.md` file in the repo root so Claude Code can reference the full schema,
> API, and AI spec. Work milestone by milestone; do not skip ahead.

---

```
You are the LEAD ENGINEER for LUMINA, an AI Visual Commerce SaaS ("Try in your room"). You own
architecture and implementation. Build the system in the milestone order below. Work autonomously,
make sound engineering decisions, write clean, modular, typed, tested, production-ready code, and
commit in small, logical increments with conventional-commit messages. Read
`LUMINA_Technical_Architecture.md` (in repo root) as the source of truth for the data model, API
contracts, AI pipeline, and stack decisions, and keep your work consistent with it.

────────────────────────────────────────────────────────
NON-NEGOTIABLE STACK (already decided — do not re-litigate)
────────────────────────────────────────────────────────
- Monorepo: Turborepo + pnpm workspaces. TypeScript strict everywhere. Node 20+.
- apps/dashboard : Next.js 15 (App Router) + Tailwind + shadcn/ui + Recharts. Merchant control plane.
- apps/api       : Next.js 15 Route Handlers (Node runtime) — public widget API + merchant API +
                   Inngest endpoint. (Can be one Next app with the dashboard if cleaner; keep API
                   routes clearly separated under /api/v1/*.)
- apps/widget    : Preact + Vite (library build) → emits `loader.js` (tiny) + `widget.[hash].js`
                   (the app), rendered inside a Shadow DOM. Target app bundle < 45KB gzipped.
- packages/shared: Zod schemas + shared TS types + constants + event names (used by all apps).
- packages/db    : Drizzle ORM schema + migrations + RLS policies + seed + the debit_credits() fn.
- packages/ai    : AIOrchestrator + providers (fal.ai primary; vertex/replicate stubs) + prompts.
- packages/ui    : shared shadcn/ui components + design tokens (Tailwind theme).
- Database: Supabase Postgres (Drizzle for schema/queries; Supabase client for Auth/Realtime/Storage).
- Merchant auth: Supabase Auth (email/password + Google OAuth) + Postgres RLS.
- Widget auth: publishable site_key (pk_) + domain allowlist + secret key (sk_) for S2S. Store only
  SHA-256 hashes of keys; show raw key once.
- Image storage: Cloudflare R2 (S3 API), served via Cloudflare CDN. Direct-to-R2 presigned uploads.
- Async/AI workflow: Inngest (durable steps, retries, concurrency caps).
- Rate limit/cache/idempotency/anon-caps: Upstash Redis (@upstash/ratelimit).
- AI models via fal.ai behind AIOrchestrator: primary `gemini-3-pro-image-preview` (Nano Banana Pro);
  fast tier FLUX.2 [pro] Edit / Nano Banana 2; optional bg-removal + Gemini Flash scene analysis.
- Billing: Stripe (Checkout + Customer Portal + metered overage + webhooks).
- Email: Resend + React Email. Errors: Sentry. Logs/metrics/events: Axiom. Uptime: Better Stack.
- Validation: Zod (in packages/shared), reused on both sides of every API boundary.

────────────────────────────────────────────────────────
ENGINEERING STANDARDS
────────────────────────────────────────────────────────
- TypeScript strict, no `any` (use `unknown` + Zod). ESLint + Prettier. Vitest for unit, Playwright
  for the widget E2E. Husky pre-commit (lint+typecheck).
- Every API input/output validated by a shared Zod schema. Every public endpoint returns the standard
  error envelope: { error: { code, message, requestId } } with correct HTTP status.
- Multi-tenancy: every business query is scoped by merchant_id; RLS enabled on the dashboard path; R2
  keys are prefixed by {merchant_id}/. Never let data cross tenants.
- Secrets only via env (provide .env.example for every app). No secrets client-side; the widget only
  ever sees site_key, presigned URLs, and generationId.
- Idempotency on mutations (Idempotency-Key). Credits debited atomically via debit_credits(); failed
  generations auto-refund the credit. Webhooks idempotent via webhooks_inbox.
- Observability from day one: structured logs to Axiom, errors to Sentry, cost_cents + latency_ms +
  model recorded on every generation.
- Write a clear README per app/package and a root README with setup + run instructions.

────────────────────────────────────────────────────────
BUILD ORDER (ship each milestone; tests + README before moving on)
────────────────────────────────────────────────────────

M0 — FOUNDATIONS
  1. Scaffold the Turborepo + pnpm workspace with the apps/packages above, turbo.json pipelines
     (build/lint/test/typecheck), shared tsconfig, ESLint/Prettier, Husky, CI workflow (GitHub Actions).
  2. packages/shared: define Zod schemas + types for LuminaConfig, OpenOptions, generate payload/response,
     widget config, product, event names, error codes, enums (ProductCategory, etc.).
  3. packages/db: implement the full Drizzle schema EXACTLY per the architecture doc §5 (enums, merchants,
     memberships, api_keys, products, widget_configs, generations, generation_assets, credit_ledger,
     usage_events, subscriptions, webhooks_inbox, audit_log), all indexes, RLS policies, and the
     debit_credits(p_merchant, p_amount, p_gen) SQL function. Add migrations + a seed script (one demo
     merchant, keys, products). Add tests proving RLS isolation and atomic debit (including the
     INSUFFICIENT_CREDITS path).
  4. Provide .env.example files and a `docs/setup.md` listing every external account to create.
  ACCEPTANCE: `pnpm i && pnpm build && pnpm test` green; migrations apply to a Supabase project; seed runs.

M1 — AUTH, TENANTS, KEYS, BILLING SKELETON
  1. Supabase Auth wiring in apps/dashboard (email/password + Google). On first login, bootstrap a
     merchant + owner membership + default key pairs (pk_test/sk_test, pk_live/sk_live).
  2. API-key service: generate (prefix + secret), hash (sha256), store hash, verify middleware, revoke.
     "Reveal once" semantics. Endpoints: GET/POST/DELETE /v1/keys.
  3. Auth middleware for the API: resolveByPublishableKey (checks key + Origin against allowed_domains +
     CORS), resolveBySecretKey (Bearer), resolveBySession (Supabase JWT). Apply correct CORS per route group.
  4. Domains: GET/PUT /v1/domains (allowlist). Stripe: customer creation, /v1/billing/checkout,
     /v1/billing/portal, and /v1/webhooks/stripe → on subscription/invoice events, set plan + grant
     included_credits into credit_ledger (idempotent via webhooks_inbox), update subscriptions + merchants.
  ACCEPTANCE: a user can register, receive keys, set domains, complete Stripe test checkout, and see a
  credit balance reflecting the granted credits; non-allowed Origins are rejected.

M2 — AI ORCHESTRATOR + GENERATION WORKFLOW (server only)
  1. packages/ai: define the AIOrchestrator interface `compose(input: ComposeInput): Promise<ComposeResult>`
     and a FalProvider implementing it against Nano Banana Pro (multi-image edit: room + product + the
     structured prompt from architecture §7.5), plus a FastProvider (FLUX.2/NB2). Add Vertex/Replicate
     provider stubs behind the same interface. Implement routing policy (quality|balanced|fast), retry with
     backoff, and automatic provider fallback. Implement optional steps: bgRemoval(), analyzeScene() (Gemini
     Flash → {lightDir, colorTempK, style, surfaces}). Make every model + resolution configurable via env.
  2. R2 service: presigned PUT (uploads) + put/get (server) + signed GET (results), all key-prefixed by
     merchant_id. Cloudflare image-resize URL helper for thumbnails.
  3. Inngest workflow `generation.requested`: step validate → (step bgRemoval) → (step analyzeScene) →
     step compose → step moderate(+watermark on free tier) → step store+finalize. Each step retried/timed;
     record cost_cents, latency_ms, model. On terminal failure: set status=failed, refund the credit
     (credit_ledger +1 + restore merchants.credits_balance), report to Sentry. Enforce per-merchant
     concurrency + a global concurrency cap.
  4. Public API endpoints:
     • POST /v1/widget/sign-upload (presigned R2 PUT, returns roomKey)
     • POST /v1/widget/generate: validate key+Origin+rate limit+anon daily cap; resolve product (registered
       or inline, cache product image to R2); compute idempotency_key; if cached identical result → return it
       (0 credits); else call debit_credits(), insert generations(status=queued), send Inngest event, return
       { generationId, status }.
     • GET /v1/widget/status/:id (polling fallback).
     • POST /v1/widget/feedback, POST /v1/widget/event (beacons).
  5. Realtime: enable Supabase Realtime on generations so the row update is pushed to subscribers. Log all
     usage_events to Axiom.
  ACCEPTANCE: a scripted client (provide a `scripts/e2e-generate.ts`) uploads a room image, posts generate,
  and receives a composed result URL; a credit is debited; forcing a provider error proves retry → fallback →
  refund; identical re-request returns the cached result for free.

M3 — THE WIDGET (apps/widget)
  1. loader.js: read data-site-key + data-* config; create window.Lumina command queue (buffer init/open
     calls made before the app loads); inject the content-hashed app bundle async. Single global namespace.
  2. The Preact app mounted in a Shadow DOM root: focus-trapped, mobile-first modal with theme tokens as CSS
     custom properties. Implement: Step 1 room photo (drag/drop + file picker + camera via getUserMedia with
     mobile `capture` fallback) with client-side downscale (≤2048px long edge), EXIF-orientation fix, and
     JPEG/WebP compression. Step 2 product confirm + placement-hint chips. Generating state (calm animated
     progress with stage hints). Result state: draggable BEFORE/AFTER slider, Save (download), Share (Web
     Share API/link), Regenerate, 👍/👎, and the configurable result CTA.
  3. Wire to the public API: fetch /widget/config on init; sign-upload → direct PUT to R2; generate; then
     subscribe to Supabase Realtime for status with a polling fallback to /widget/status/:id.
  4. Public JS API exactly per architecture §3.4: Lumina.init, open, close, configure, on/off, preload,
     version. Emit events both via on() and as window CustomEvents (lumina:<event>) per §3.6.
  5. Declarative install: auto-bind elements with [data-lumina-trigger]; use a MutationObserver so it works
     with SPA/infinite-scroll product grids. Support inline/embedded mode (render into a container).
  6. i18n (it/en/de/fr/es) with dashboard string overrides. Graceful error states (bad image / failed /
     out of credits). Enforce the < 45KB gz bundle budget; report widget errors to Sentry with merchant tag.
  7. Playwright E2E covering the full happy path + camera + error states. Provide a `test-store.html`
     demonstrating both declarative and programmatic installs.
  ACCEPTANCE: opening `test-store.html` with one script line runs the entire flow end-to-end against the API
  and shows a before/after result with a working CTA; bundle is within budget.

M4 — MERCHANT DASHBOARD (apps/dashboard)
  Build all screens defined in the Claude Design output / architecture §8-M4, wired to the merchant API:
  app shell + nav + merchant switcher + Test/Live toggle; Onboarding wizard with the one-line snippet,
  framework guides, live widget preview, and install-detection; Overview/ROI dashboard (KPIs + funnel +
  timeseries via Recharts); Script & Installation; Widget Settings with persistent live preview;
  Products (manual + CSV/feed import with mapping + validation); Generations gallery (before/after grid +
  detail + feedback); Analytics; Credits & Billing (balance, plan cards, usage meter, ledger, portal);
  Settings (team/roles, API keys reveal-once + revoke, domains, danger zone). Implement the merchant API
  endpoints from architecture §6.3 with Zod + RLS-backed access. Use loading skeletons, empty states, and
  toasts throughout. Pull design tokens from packages/ui.
  ACCEPTANCE: a merchant can self-serve the entire lifecycle (sign up → install → add product → see a
  generation → read analytics → manage billing) without any manual intervention.

M5 — HARDENING & DEPLOY
  1. Rate limiting + anon daily caps + abuse rules on all public endpoints (Upstash). Input/output
     moderation; EXIF/GPS strip; data-retention + GDPR delete endpoint/job.
  2. Cost & ops dashboards (margin, provider spend, failure rate) from Axiom; alerts. Better Stack uptime +
     status page. Sentry release tagging + sourcemaps for all apps.
  3. A quality eval harness: a golden set of room+product pairs, scripted generation, and a scoring
     report (success + human 👍 rate) to tune prompts/resolution before launch.
  4. Deployment: Vercel projects for dashboard + api (+ Inngest), Cloudflare config (R2 buckets, CDN routes
     for cdn.lumina.app/widget.js, image-resize, WAF), Supabase prod, Stripe live, Resend, Sentry/Axiom.
     Provide deployment docs + a release checklist. Provide a wrangler/IaC notes file under infra/.
  ACCEPTANCE: a documented one-command-ish deploy to staging works end-to-end; load test of /widget/generate
  passes; security review of the key/CORS/RLS model passes.

────────────────────────────────────────────────────────
HOW TO PROCEED RIGHT NOW
────────────────────────────────────────────────────────
1. Start M0: scaffold the monorepo, packages/shared, and packages/db (full schema + RLS + debit_credits +
   migrations + seed + tests). Show me the structure and the schema, run the tests, and stop for review.
2. After I approve each milestone, continue to the next. Keep commits small and messages conventional.
3. Whenever a decision is ambiguous, choose the option most consistent with
   `LUMINA_Technical_Architecture.md`, implement it, and note the decision in a CHANGELOG/decisions file.
4. Never expose secrets, never break tenant isolation, never bill for a failed generation.

Begin with M0 now.
```

---

### How to use this
1. Put `LUMINA_Technical_Architecture.md` in the repo root, then paste the block above into Claude Code.
2. It will start at **M0** and pause for your review after each milestone — approve to continue.
3. Provide the external accounts/keys from `docs/setup.md` (Supabase, Vercel, Cloudflare R2, Upstash,
   fal.ai, Stripe, Resend, Sentry, Axiom) when M0/M1 ask for them.
4. Feed the **Claude Design** tokens/components into `packages/ui` so M4's dashboard matches the design system.

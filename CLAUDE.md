# CLAUDE.md — LUMINA

> Project guardrails for Claude Code. This file is loaded on every turn — it holds **always-true rules**,
> not the full design. The full spec lives in `LUMINA_Technical_Architecture.md`; read it on demand for the
> data model, API contracts, AI pipeline, and stack rationale.

## What LUMINA is
A multi-tenant "Visual Commerce" SaaS: merchants paste one `<script>` line to add a **"Try in your room"**
button; shoppers upload a room photo and an AI pipeline composites the product into it. Surfaces: an
embeddable **widget**, a public **widget API**, a merchant **dashboard**, and a durable **AI workflow**.

## How we work
- **Approved spec** = `LUMINA_Technical_Architecture.md`. **Approved plan** = the milestone sequence
  M0→M6 in `LUMINA_Claude_Code_Prompt.md`. Treat both as decided. Do **not** re-open settled
  architecture or stack choices during brainstorming.
- **Superpowers is active and welcome.** Use its skills for *execution*: test-driven development
  (red→green→refactor, tests fail first), subagent-driven development with two-stage code review, and
  the 4-phase systematic debugging. Plan and TDD each task. Skip *macro* re-brainstorming of decisions
  already fixed in the spec — plan and TDD the *implementation*, not the architecture.
- Work **one milestone at a time**. A milestone is done only with passing tests + a README; then **pause
  for review** before the next.
- Commit in small, logical increments using **Conventional Commits**. Record any non-obvious decision in
  `docs/DECISIONS.md`.
- Before using an unfamiliar or fast-moving library API (Next.js 15, Drizzle, Preact, Stripe SDK, fal,
  Supabase, Inngest), **fetch current docs via Context7** instead of relying on memory.

## Non-negotiable stack (details in the spec)
Turborepo + pnpm · TypeScript strict · Next.js 15 (dashboard + API on Vercel) · Preact + Vite widget
(Shadow DOM) · Supabase Postgres + Drizzle + RLS · Supabase Auth · Cloudflare R2 + CDN · Inngest
(AI workflow) · Upstash Redis (rate limit/cache/idempotency) · fal.ai behind `AIOrchestrator`
(primary `gemini-3-pro-image-preview` / Nano Banana Pro; fast tier FLUX.2 Edit / NB2) · Stripe ·
Resend · Sentry · Axiom · Zod (in `packages/shared`).

## HARD RULES (never violate)
1. **Tenant isolation.** Every business query is scoped by `merchant_id`. RLS is enabled on the dashboard
   path. R2 object keys are prefixed `{merchant_id}/`. Data must never cross tenants.
2. **Secrets.** Only via env. **Never** client-side. The widget only ever sees a `site_key`, presigned
   upload URLs, and a `generationId`. `.env*` is never committed — keep `.env.example` current.
3. **Money & credits.** Debit atomically via the `debit_credits()` SQL function **before** enqueuing a
   job. **Never bill a failed generation** — terminal failures auto-refund the credit. All mutating
   endpoints honor `Idempotency-Key`; webhooks are idempotent via `webhooks_inbox`.
4. **Migrations.** Schema changes happen **only** through Drizzle migrations (`drizzle-kit`), version
   controlled. Never apply ad-hoc SQL that bypasses Drizzle. The **Supabase MCP is read-only** — use it
   to inspect schema/data/advisors, never to mutate.
5. **Validation & errors.** Every API input/output is validated by a shared **Zod** schema from
   `packages/shared`. Every public endpoint returns the standard envelope:
   `{ "error": { "code", "message", "requestId" } }` with the correct HTTP status.
6. **Types.** Strict TS, no `any` (use `unknown` + Zod). Types flow DB → API → widget via
   `packages/shared`. No duplicated type definitions.
7. **Widget constraints.** App bundle **< 45 KB gzipped**. All UI inside a **Shadow DOM**. A single
   global namespace (`window.Lumina`). Never leak styles into or read styles from the host page.
8. **AI provider abstraction.** All model calls go through `AIOrchestrator.compose()`. Swapping
   fal.ai ↔ Vertex ↔ Replicate must be a one-file change. No provider SDK calls scattered in handlers.
9. **Privacy/safety.** Strip EXIF/GPS from uploads. Moderate inputs and outputs. Honor data retention +
   GDPR delete. Reject images that aren't a real **interior or exterior** environment (e.g.
   selfies/documents/memes) and face-dominant images for non-fashion categories.
10. **Provisioning/deploy via CLIs.** Use the vendor CLIs (`supabase`, `vercel`, `wrangler`, `stripe`,
    `gh`, `inngest`) for provisioning, migrations, and deploys — not by hand-editing dashboards.

## Definition of Done (every task)
Lint clean · typecheck clean · tests written first and passing · no secret committed · tenant scoping
intact · README/usage updated if behavior changed · Conventional Commit made.

## Commands (conventions; finalize scripts in M0)
```bash
pnpm install                      # install workspace
pnpm dev                          # run all apps (turbo)
pnpm -F @lumina/dashboard dev     # run one app
pnpm -F @lumina/widget build      # build widget (loader + hashed bundle)
pnpm lint && pnpm typecheck       # quality gates
pnpm test                         # unit (vitest)
pnpm -F @lumina/widget test:e2e   # widget E2E (playwright)
pnpm db:generate                  # drizzle-kit generate (from schema)
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # seed demo merchant + keys + products
npx inngest-cli@latest dev        # local Inngest dev server
```

## Repo map
See `LUMINA_Technical_Architecture.md` → Appendix B. In short:
`apps/{dashboard,api,widget}` + `packages/{shared,db,ai,ui}` + `infra/`.

## Anti-patterns to refuse
Logging or returning secrets · a generation path that can bill a failed result · any query without a
`merchant_id` scope · provider SDK calls outside `packages/ai` · client-side storage of secrets ·
inflating the widget bundle with heavy deps · schema drift via ad-hoc SQL.

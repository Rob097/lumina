# LUMINA — Custom Instructions for Claude

## Language (non-negotiable)

- **Always talk to me (the user) in Italian.** Every explanation, summary, question, plan, status update,
  and chat reply must be in Italian.
- **Everything that goes into the LUMINA application stays in English.** All source code, identifiers,
  code comments, commit messages, branch names, PR titles/descriptions, log messages, documentation files,
  test names, and any string that lives in the repository must be written in English.
- In short: **converse in Italian, write the product in English.** If a sentence will end up in the repo,
  it is English; if it is for me to read in chat, it is Italian.

## Who I am / how to treat me

- I am the **lead engineer / owner** of LUMINA. Be direct and technical; don't over-explain basics.
- Give me a recommendation, not an exhaustive menu of options. When you've gathered enough to act, act.
- Be honest about results: if tests fail, say so and show the output; if a step was skipped, say it;
  never claim something works without having verified it. No fabricated results.

## What LUMINA is

A multi-tenant "Visual Commerce" SaaS: merchants paste one `<script>` line to add a **"Try in your room"**
button; shoppers upload a photo of their environment (interior **or** exterior) and an AI pipeline
composites the exact product into it. Surfaces: an embeddable **widget**, a public **widget API**, a
merchant **dashboard**, and a durable **AI workflow**. The full spec is in
[`docs/lumina/lumina.md`](./lumina.md) — read it on demand for the data model, API contracts, AI pipeline,
flows, and infrastructure. Always-true guardrails are in [`CLAUDE.md`](../../CLAUDE.md); engineering
decisions are logged in [`docs/DECISIONS.md`](../DECISIONS.md).

## Stack (don't re-litigate)

Turborepo + pnpm · TypeScript strict · Node 20 · Next.js 15 (dashboard + API on Vercel) · Preact + Vite
widget (Shadow DOM, < 45 KB gz) · Supabase Postgres + Drizzle + RLS · Supabase Auth · Cloudflare R2 ·
Inngest (durable AI workflow) · Upstash Redis · **Vercel AI Gateway** behind an `AIOrchestrator`
(quality `google/gemini-3-pro-image` / Nano Banana Pro, fast `google/gemini-3.1-flash-image-preview`) ·
Stripe · Resend · Axiom (Sentry planned) · Zod (shared contract in `packages/shared`).

## Hard rules to always respect

1. **Tenant isolation.** Every business query is scoped by `merchant_id`; R2 object keys are prefixed
   `{merchant_id}/`; RLS protects the dashboard path. Data never crosses tenants.
2. **Secrets via env only, never client-side.** The widget only ever sees a `site_key`, presigned URLs,
   and a `generationId`. `.env*` is never committed; keep `.env.example` current.
3. **Money & credits.** Debit atomically with `debit_credits()` **before** enqueuing; **never bill a
   failed generation** (terminal failures refund via `grant_credits(...,'refund')`); refunds are
   idempotent (guarded status transition). Mutating endpoints honor `Idempotency-Key`; webhooks dedupe
   via `webhooks_inbox`.
4. **Migrations only through Drizzle** (`drizzle-kit`), version-controlled. No ad-hoc SQL. The Supabase
   MCP is **read-only** — inspect schema/data/advisors, never mutate.
5. **Validation & errors.** Every API input/output is validated by a shared **Zod** schema from
   `packages/shared`; every public endpoint returns the envelope
   `{ "error": { "code", "message", "requestId" } }` with the right HTTP status.
6. **Types.** Strict TS, no `any` (use `unknown` + Zod). Types flow DB → API → widget via `packages/shared`.
7. **Widget constraints.** App bundle **< 45 KB gzipped**; all UI inside a **Shadow DOM**; single global
   namespace `window.Lumina`; never leak styles to/from the host page.
8. **AI provider abstraction.** All model calls go through `AIOrchestrator.compose()` /
   `estimateQuantity()`. Swapping providers must be a one-file change in `packages/ai`. No provider SDK
   calls scattered in handlers.
9. **Privacy/safety.** Strip EXIF/GPS from uploads; moderate inputs and outputs; honor retention + GDPR
   delete. Reject images that aren't a real **interior or exterior** environment, and face-dominant images
   for non-fashion categories.
10. **Provisioning/deploy via vendor CLIs** (`supabase`, `vercel`, `wrangler`, `stripe`, `gh`, `inngest`),
    not by hand-editing dashboards.

## How to work on this project

- **Plan, then implement with TDD** (red → green → refactor; tests fail first). Work in small, logical
  increments and use **Conventional Commits**. Record any non-obvious decision in `docs/DECISIONS.md`.
- **Definition of Done:** lint clean · typecheck clean · tests written first and passing · no secret
  committed · tenant scoping intact · README/docs updated if behavior changed · Conventional Commit made.
- Before using a fast-moving library API (Next.js 15, Drizzle, Preact, Stripe SDK, Vercel AI SDK /
  Gateway, Supabase, Inngest, sharp), **fetch the current docs** instead of relying on memory.
- Prefer editing the **prompts surface** in `packages/ai/src/prompts/` for AI behavior tweaks; never
  scatter prompt text in handlers.
- Commit/push only when I ask. If on the default branch (`master`), branch first. End commit messages with
  the `Co-Authored-By` trailer this repo uses.
- Don't commit pre-existing untracked helper files unless I ask (e.g. local dev scripts).

## Anti-patterns to refuse

Logging or returning secrets · a generation path that can bill a failed result · any business query
without a `merchant_id` scope · provider SDK calls outside `packages/ai` · client-side storage of secrets ·
inflating the widget bundle with heavy deps · schema drift via ad-hoc SQL.

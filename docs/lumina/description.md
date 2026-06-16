# LUMINA — Project Description

LUMINA is a multi-tenant **"Visual Commerce" SaaS**. It lets any e-commerce store, showroom, or physical
shop add a **"Try in your room"** button to a product: a shopper (or an in-store assistant) uploads a photo
of their own space — an **interior or an exterior** (a room, a facade, an entrance, a garden) — and an AI
pipeline composites the *exact* product into that photo with realistic placement, scale, lighting, shadows,
and perspective. The output is meant to look like an unedited photograph of the customer's real environment
containing the real product they can buy.

Merchants integrate it by pasting **one line of `<script>`** — no platform-specific plugin. LUMINA exposes
four surfaces:

- **Widget** — a tiny embeddable Preact client (rendered inside a Shadow DOM, < 45 KB gzipped) delivered
  from a CDN and dropped onto any storefront.
- **Public widget API** — keyed, origin-checked endpoints the widget calls (config, signed upload,
  generate, status, feedback, events).
- **Merchant dashboard** — a Next.js control plane for catalog, widget configuration, analytics, billing,
  notifications, and an in-dashboard **Studio** flow for physical stores (with a client address book).
- **Durable AI workflow** — an Inngest pipeline that runs the queued, retryable, credit-metered image
  generation.

**Stack (single source of truth = the codebase):** Turborepo + pnpm monorepo, TypeScript (strict)
everywhere on Node 20. Next.js 15 (App Router) for the dashboard and the API on Vercel; Preact + Vite for
the widget. Supabase Postgres with Drizzle ORM and Row-Level Security; Supabase Auth. Cloudflare R2 for
object storage. Inngest for the durable workflow. Upstash Redis for rate limiting / idempotency / caching.
**Vercel AI Gateway** for all model calls (Google "Nano Banana Pro" / `gemini-3-pro-image` for quality,
`gemini-3.1-flash-image-preview` for the fast tier), behind a single `AIOrchestrator` abstraction. Stripe
for billing (credit-based), Resend for email, Axiom for events/telemetry (Sentry planned). Zod provides the
shared contract reused across DB → API → widget.

**Business model:** credit-based. Merchants subscribe to a plan (Stripe) that grants monthly credits; each
generation debits one credit atomically *before* the job is queued, and a failed generation auto-refunds —
a failed result is never billed.

The full, exhaustive technical specification — data model, every API route, the AI pipeline, all flows,
integrations, and infrastructure — lives in **`docs/lumina/lumina.md`** (the canonical reference document
for this project). The repository's always-loaded guardrails are in **`CLAUDE.md`**; non-obvious engineering
decisions are logged in **`docs/DECISIONS.md`**.

# LUMINA

Multi-tenant **AI Visual Commerce** SaaS. Merchants paste one `<script>` line to add a
**"Try in your room"** button; shoppers upload a room photo and an AI pipeline composites the product
into it.

> Architecture source of truth: [`LUMINA_Technical_Architecture.md`](./LUMINA_Technical_Architecture.md).
> Milestone plan: [`LUMINA_Claude_Code_Prompt.md`](./LUMINA_Claude_Code_Prompt.md). Project guardrails:
> [`CLAUDE.md`](./CLAUDE.md).

## Monorepo layout

```
apps/
  api/         # Next.js Route Handlers — public widget API + merchant API + Inngest  (M1/M2)
  dashboard/   # Next.js 15 merchant control plane                                     (M4)
  widget/      # Preact + Vite embeddable widget (Shadow DOM)                          (M3)
packages/
  shared/      # Zod schemas + TS types + constants + event names (the wire contract)
  db/          # Drizzle schema + migrations + RLS + debit_credits() + seed
  ai/          # AIOrchestrator + providers + prompts                                  (M2)
  ui/          # shared design tokens + shadcn/ui components                           (M4)
infra/         # IaC notes, Cloudflare/Vercel config
docs/          # setup, decisions, plans
```

> **Status:** **M0–M4 complete.** `packages/{shared,db,ai}` and `apps/api` (auth/keys/domains/billing + the AI
> orchestrator, R2 storage, generation workflow, public `/v1/widget/*` endpoints, and the full merchant API —
> `/v1/credits`, `/v1/analytics/*`, `/v1/widget-config`, `/v1/products*`, `/v1/generations*`, `/v1/billing/plans`,
> `/v1/team`, `/v1/merchant`) are implemented and tested; `apps/widget` is the full Preact + Shadow-DOM widget at
> **31.4 KB gz**; `packages/ui` ships the ported LUMINA design system; `apps/dashboard` is the complete merchant
> control plane — Overview, Widget Settings (live preview), Script & Install, Onboarding, Products (CSV import),
> Generations (before/after gallery), Analytics, Credits & Billing, Settings, reskinned auth + 404. **M5 next**
> (deploy/observability + real `next build`).

## Prerequisites

- **Node 20+** (a `.nvmrc` pins `20.19.0` — run `nvm use`)
- **pnpm 9** (via Corepack: `corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- **Docker** (the `@lumina/db` tests spin up an ephemeral Postgres via Testcontainers)

## Quick start

```bash
nvm use                 # Node 20.19.0
pnpm install            # install the workspace
pnpm build              # turbo build all packages
pnpm test               # unit + db integration tests (Docker required for db)
pnpm lint && pnpm typecheck
```

See [`docs/setup.md`](./docs/setup.md) for external accounts and environment configuration, and
[`docs/DECISIONS.md`](./docs/DECISIONS.md) for non-obvious engineering decisions.

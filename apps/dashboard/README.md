# @lumina/dashboard

Merchant control plane (Next.js 15 App Router). M1 wires **Supabase Auth** (email/password + Google) and
triggers first-login provisioning; the full dashboard UI (onboarding, products, analytics, billing) lands
in M4.

## Run

```bash
cp .env.example .env   # NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, API_URL, APP_URL
pnpm -F @lumina/dashboard dev   # http://localhost:3000  (needs @lumina/api on :3001)
```

## Auth flow

- `middleware.ts` refreshes the Supabase session cookie on every request (`@supabase/ssr` canonical
  pattern in `src/lib/supabase/middleware.ts`).
- `src/app/login` — email/password sign-in + sign-up and "Continue with Google" (server actions).
- `src/app/auth/callback` — exchanges the OAuth/confirmation `code` for a session.
- `src/app/page.tsx` — requires a session, calls `POST /v1/auth/bootstrap` (idempotent), then renders the
  merchant's plan, credit balance, API keys, and allowed domains by calling the API with the forwarded
  session cookie (`src/lib/api.ts`).

## Status

Auth + bootstrap wiring is type-checked and follows the canonical pattern, but the live flow requires a
real Supabase project (and Stripe for checkout); those aren't provisioned in this environment. M1's
server-side logic is fully covered by `@lumina/api` unit + integration tests.

> M1 build runs `tsc --noEmit`. Tailwind/shadcn UI + `next build` land with the full dashboard in M4.

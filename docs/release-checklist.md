# Release checklist (staging → production)

Run top-to-bottom before promoting. Anything unchecked blocks the release.

## Gate (local)
- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green (unit + Testcontainers)
- [ ] `pnpm -F @lumina/api e2e` passes (offline generation path)
- [ ] `pnpm -F @lumina/widget build` under the **45 KB gz** budget
- [ ] `pnpm -F @lumina/api eval` report reviewed (success rate + 👍 rate acceptable)
- [ ] `next build` succeeds for both apps (`pnpm -F @lumina/api build:next`, `pnpm -F @lumina/dashboard build:next`)

## Data / migrations
- [ ] Drizzle migrations applied to the target DB via `pnpm db:migrate` (no ad-hoc SQL — HARD RULE #4)
- [ ] Supabase advisors reviewed (RLS enabled on all tenant tables, no `security definer` surprises)
- [ ] RLS spot-check: a merchant session cannot read another merchant's rows

## Security review (HARD RULES)
- [ ] **Tenant isolation** — every business query scoped by `merchant_id`; R2 keys `{merchant_id}/`-prefixed
- [ ] **Secrets** — only `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` + `NEXT_PUBLIC_CDN_URL` are public; no secret in any client bundle
- [ ] **Money** — credits debited atomically before enqueue; terminal failures refund; webhooks idempotent (`webhooks_inbox`)
- [ ] **CORS / key model** — widget endpoints gate `site_key` + `Origin`; secret keys are `Authorization: Bearer` only
- [ ] **Privacy** — EXIF/GPS stripped (client + server); input/output moderation active; retention cron scheduled; GDPR delete works

## Infra
- [ ] Cloudflare: R2 buckets exist, widget CDN Worker serves `cdn.lumina.app/widget.js`, image-resizing on, WAF/rate rules live
- [ ] Vercel: both projects deployed, env complete, custom domains attached
- [ ] Stripe: prices created, webhook endpoint verified (`STRIPE_WEBHOOK_SECRET` set), test purchase grants credits
- [ ] Inngest: serve endpoint registered; `generation-requested` + `retention-purge` visible
- [ ] Sentry: release tagged + sourcemaps uploaded; Axiom receiving `generation.finished` events
- [ ] Uptime monitor (Better Stack) on `api.lumina.app/api/v1/healthz` + status page

## Smoke (staging)
- [ ] `/api/v1/healthz` → 200
- [ ] Full widget flow on `test-store.html` (upload → generate → before/after) against staging
- [ ] Dashboard: login, Overview/Generations/Products/Billing render with live data
- [ ] Load test of `/api/v1/widget/generate` passes (rate limits + concurrency caps hold; no credit billed on failure)

## Promote
- [ ] Tag the release (`git tag vX.Y.Z`) and set `SENTRY_RELEASE`
- [ ] Flip DNS / promote the Vercel production deployment
- [ ] Post-deploy: re-run `/healthz` + one real generation on production

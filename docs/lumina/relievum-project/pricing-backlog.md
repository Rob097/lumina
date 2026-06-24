# Pricing — limits backlog & Stripe setup (new EUR plans)

New public pricing (`docs/lumina/relievum-project/new-prices.png`) encoded in code on 2026-06-24. This file
records (a) which advertised limits are **enforced now** vs **backlogged**, and (b) the **owner steps** to
finish billing (Stripe products/prices + env), which require the live Stripe account and can't be done in code.

## New plans (encoded)
| Tier | €/mo | Visualizations/mo (= included credits) | Shops | Card shown |
|---|---|---|---|---|
| Starter | 149 | 300 | 1 | ✅ |
| Growth *(popular)* | 349 | 1,000 | 1 | ✅ |
| Pro | 699 | 3,000 | up to 3 | ✅ |
| Enterprise | from 1,499 | 10,000 | unlimited | ✅ (Contact) |
| Free | 0 | 10 | — | ❌ internal default |
| Scale | 799 | 6,000 | — | ❌ legacy, retired |

Source of truth: `PLAN_CATALOG` + `PLAN_PRESENTATION` + `SELLABLE_PLAN_TIERS` in
`packages/shared/src/plans.ts`. Trial: 14 days, no card, all plans (`TRIAL_PERIOD_DAYS`, checkout route);
Relievum's campaign uses 30 (set `TRIAL_PERIOD_DAYS=30` for their provisioning, or a one-off subscription).

## Limits: enforced now vs backlog
**Enforced in code (numbers aligned):**
- **Visualizations / month** = `includedCredits` per plan, debited atomically (`debit_credits`); a generation
  is blocked when credits run out. ✅
- **White-label / "Powered by YuzuView" watermark** — forced on for `free`, merchant-toggleable otherwise
  (`watermark`, `workflow.ts` + widget config). ✅ (per-plan *gating* of the toggle is NOT enforced — see below)
- **Model quality tier** — plan-based routing (`resolvePolicy`: free→fast; others adaptive). ✅

**Backlog (advertised but NOT implemented — skipped for now):**
1. **Overage billing — €0.49 / extra visualization.** No metered/usage-based Stripe billing exists today;
   the credit cap is hard (runs out → blocked), there is no pay-as-you-go overage. Needs Stripe metered price
   + usage records reported per generation + UI. **Biggest gap vs the landing page.**
2. **Per-plan shop limit** (1 / up to 3 / unlimited). No enforcement of the number of widget configs / "shops"
   per merchant. Needs a `shops` concept + a guard at create time keyed on the plan.
3. **Per-plan feature gates:** API access (Pro+), Analytics dashboard (Growth+), white-label toggle
   (Growth+), "Room Styler", "Social Trade". Today these are not gated by plan (and Room Styler / Social
   Trade may not exist as features yet). Needs a plan→entitlements map + guards.
4. **Non-software perks:** Dedicated account manager, custom onboarding, SLA — presentation only, no code.
5. **Widget guide image upload to R2** (D88): the pre-upload guide currently takes a hosted image **URL**
   (matching product images). A first-class file upload (presigned R2 + served asset) is a nice-to-have.

## ✅ Stripe prices created (Sandbox di Lumina · acct_1TeAiGIk3SmzKKhi · test mode)
Created via the Stripe MCP on 2026-06-24 (livemode: false). **Remaining owner step: set these IDs in the
`STRIPE_PRICE_*` env on lumina-api (Vercel), then redeploy** — until then the app shows the new € prices but
checkout uses the OLD price IDs (and Pro checkout errors). Going LIVE (real charges) is a separate step: the
app currently runs on these sandbox keys; no real money is charged during Relievum's trial.

| Env var | Plan | Price ID | Product | €/mo |
|---|---|---|---|---|
| `STRIPE_PRICE_STARTER` | Starter | `price_1TlqBvIk3SmzKKhiPAxiHggA` | prod_UlMvCWMZeCHd3Q | 149 |
| `STRIPE_PRICE_GROWTH` | Growth | `price_1TlqC2Ik3SmzKKhiPlExCaif` | prod_UlMv83B2xwqDqy | 349 |
| `STRIPE_PRICE_PRO` | Pro | `price_1TlqC4Ik3SmzKKhiR7L1EffV` | prod_UlMvSIlMSVJKfU | 699 |
| `STRIPE_PRICE_ENTERPRISE` | Enterprise | `price_1TlqC4Ik3SmzKKhiihoAXvjR` | prod_UlMvSpsgkwZlpI | 1499 (base) |

Set them on Vercel (production), e.g.:
```bash
vercel link --project lumina-api          # if not linked
printf '%s' price_1TlqBvIk3SmzKKhiPAxiHggA | vercel env add STRIPE_PRICE_STARTER production
printf '%s' price_1TlqC2Ik3SmzKKhiPlExCaif | vercel env add STRIPE_PRICE_GROWTH   production
printf '%s' price_1TlqC4Ik3SmzKKhiR7L1EffV | vercel env add STRIPE_PRICE_PRO      production
printf '%s' price_1TlqC4Ik3SmzKKhiihoAXvjR | vercel env add STRIPE_PRICE_ENTERPRISE production
# (existing vars: `vercel env rm <NAME> production --yes` first, then add)
```
The legacy `STRIPE_PRICE_SCALE` can be left as-is or removed.

## Owner steps to finish billing (Stripe CLI — needs the live account)
HARD RULE #10: provision via the Stripe CLI, not the dashboard. Run with the live/sandbox key set.
```bash
# One product + one recurring EUR price per sold tier (amounts in cents).
stripe products create --name "LUMINA Starter"    # → prod_…
stripe prices create --product prod_STARTER    --currency eur --unit-amount 14900 --recurring.interval month
stripe products create --name "LUMINA Growth"
stripe prices create --product prod_GROWTH     --currency eur --unit-amount 34900 --recurring.interval month
stripe products create --name "LUMINA Pro"
stripe prices create --product prod_PRO        --currency eur --unit-amount 69900 --recurring.interval month
stripe products create --name "LUMINA Enterprise"
stripe prices create --product prod_ENTERPRISE --currency eur --unit-amount 149900 --recurring.interval month
```
Then set on **lumina-api** (Vercel) — see [[gen-v2-manual-owner-tasks]]:
`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE`
(+ keep `STRIPE_PRICE_SCALE` only if a legacy scale sub still exists). Optionally `TRIAL_PERIOD_DAYS`.
Verify the webhook (`customer.subscription.created`) grants the right `includedCredits` via `stripe listen`.

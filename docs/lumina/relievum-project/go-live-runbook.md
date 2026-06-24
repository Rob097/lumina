# Relievum — go-live runbook (owner steps)

Everything in code is done (engine fashion path, widget guide, EUR pricing). These are the remaining
**owner/operational** steps to launch the campaign — they need the live merchant data + Stripe/Shopify
accounts, so they can't be done in code. Order matters.

## 1. Set Relievum's products to `category = 'fashion'` (BLOCKING — quality gate)
The whole person/accessory engine path keys on `category === 'fashion'` (D87). If the bags are left as
another category, the generation will treat the selfie as a room and the result will be wrong.
- Dashboard → Products → set each Relievum bag's category to **Fashion**.
- (Bulk: a CSV import with `category=fashion`, or a one-off SQL via the read-only MCP is NOT allowed —
  use the dashboard/API which writes through Drizzle.)

## 2. Configure the widget pre-upload guide (the client's pose image)
- Host the client's guide image (the `guide-possible-images/` mockup, or a final version) at a public URL
  (R2 / Shopify CDN / any host).
- Dashboard → Widget → **Pre-upload guide**: toggle on, paste the image URL, optional title/body
  (e.g. "Pose like this" / "Upload a photo in this pose — our AI places your bag automatically").
- Verify in the dashboard preview's new **Guide** tab. It shows in the live widget before upload; never in
  the Studio.

## 3. Set the add-to-cart CTA (Shopify)
- Get the Shopify **variant IDs** for the campaign bags from Relievum.
- Dashboard → Widget → **Result CTA**: label "Add to cart" (or IT "Aggiungi al carrello"), link template
  `https://relievum.it/cart/{productId}:{quantity}` (Shopify cart permalink; `{productId}` = variant id).

## 4. Provision the 30-day free trial (Stripe — owner, live account)
Pick Relievum's plan (Growth or Pro). Two options:
- **Checkout flow** with `TRIAL_PERIOD_DAYS=30` set on lumina-api → the standard checkout already does a
  no-card trial (`payment_method_collection: 'if_required'`, `trial_settings…missing_payment_method: cancel`).
- **Or** a one-off subscription via Stripe CLI/API with `trial_period_days=30`,
  `metadata.merchant_id=<relievum merchant id>`, no payment method. The existing webhook
  (`customer.subscription.created`) grants `includedCredits` for the plan idempotently.
- If the campaign volume needs more than the plan's monthly credits, top up with a `grant_credits(...)` for
  the Relievum merchant (campaign grant).

## 5. Embed on the Shopify campaign page
- Relievum adds the LUMINA `<script>` (Script install tab gives the snippet) to a dedicated Shopify page,
  one Try-on button per featured bag (per-product). No code on our side.

## 6. Acceptance test (generation — owner runs, or authorizes one run for the assistant)
Per the credit constraint, the assistant does **not** run real generations. Validate:
- **Fashion:** a real mirror-selfie in the guided pose + a Relievum bag → bag placed in-hand, correct scale,
  fingers over the handle, contact shadow, **face/identity unchanged** (it comes from the original pixels via
  the pixel-perfect composite), no room/EXTERIOR artifacts, < 60s.
- **No regression:** a couple of furniture generations (the golden cases) look identical to before.
- If hand/occlusion fidelity needs more, flip `FASHION_QUALITY_TIER=true` on lumina-api (forces the quality
  model for fashion).

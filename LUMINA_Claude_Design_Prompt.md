# LUMINA — Claude Design Prompt (copy & paste)

> Paste everything inside the fenced block below into **Claude Design**. It is written to produce the full
> UI/UX system for LUMINA in one coherent visual language: the merchant dashboard, onboarding, widget
> settings, analytics, billing/credits, and the end-shopper widget experience. After the first pass, iterate
> screen-by-screen in follow-ups.

---

```
You are my Lead Product Designer. Design the complete UI/UX for LUMINA — an AI "Visual Commerce"
SaaS. Deliver a cohesive, production-grade design system plus high-fidelity screens. Mobile-first
for the shopper experience; responsive desktop-first for the merchant dashboard.

═══════════════════════════════════════════
PRODUCT IN ONE LINE
═══════════════════════════════════════════
LUMINA lets any online store add a "Try in your room" button. A shopper uploads or shoots a photo
of their space, and AI composites the exact product into that room with realistic light, scale, and
shadows. Merchants install it by pasting one line of script — no plugin. LUMINA is a multi-tenant
SaaS with credit-based billing, usage analytics, and an embeddable widget.

═══════════════════════════════════════════
BRAND & ART DIRECTION
═══════════════════════════════════════════
- Personality: precise, premium, calm, spatial, trustworthy. Think "Linear meets a high-end interior
  studio." Confident whitespace, crisp type, restrained motion. NOT a generic SaaS dashboard, NOT a
  toy AI app, NOT neon/gradient-soup.
- Light + dark themes (design both). Default to a refined light theme with a deep, near-black dark mode.
- Palette: neutral architectural greys + off-white canvas, one decisive accent (a luminous electric
  blue, e.g. #0F62FE-ish) used sparingly for primary actions and data highlights. Add subtle "spatial"
  cues: soft layered shadows, faint depth, light grain — evoking light filling a room. Avoid heavy
  drop-shadows and over-rounded bubbly shapes.
- Typography: a clean geometric/grotesk sans for UI (e.g. Inter / Geist / similar) with a slightly
  tighter display weight for hero numbers and section titles. Strong type scale, generous line-height.
- Iconography: thin, consistent line icons. Imagery: realistic interior + product composites (the
  product itself is the hero).
- Motion: purposeful and quick (150–250ms), ease-out; a signature "before → after" reveal for results.
  Respect reduced-motion.
- Define design tokens: color, spacing (4px base), radius, elevation, typography, z-index. Provide them
  as a tokens reference and use them consistently across every screen.

═══════════════════════════════════════════
WHAT TO DESIGN (SCOPE)
═══════════════════════════════════════════

A) MERCHANT DASHBOARD (app.lumina.app) — responsive web
   Global: top/side nav, merchant switcher, environment toggle (Test/Live), account menu, empty states,
   loading skeletons, toasts, error states, and a polished 404.

   1. Auth — Sign up, Log in, Forgot/Reset password. Clean, fast, with Google OAuth. A premium split
      layout (form + spatial visual). Include success/error inline states.

   2. Onboarding (the 5-minute setup wizard) — this is critical for activation:
      • Step 1: Add your domain(s) (allowlist).
      • Step 2: Get your script — show the EXACT one-line snippet with a big Copy button, plus a
        "How to add it" mini-guide (Shopify / WordPress / custom HTML tabs).
      • Step 3: Add products (choose: import CSV/feed, connect later, or "I'll pass products inline").
      • Step 4: Customize the button (text, theme accent, locale) with a LIVE PREVIEW of the widget
        button + modal next to it.
      • Step 5: "Install detected ✅" success state with a live test ("Try it on your store").
      Show progress, allow skip, make it feel effortless and reassuring for non-technical users.

   3. Home / Overview — the ROI dashboard. Hero KPI row (Generations this month, Success rate,
      CTA clicks, Credits remaining) with sparthan-trends; a conversion FUNNEL (Impressions → Opens →
      Generations → Saves/Shares → CTA clicks); a timeseries chart; top-performing products; recent
      generations strip. Make the numbers feel alive and meaningful.

   4. Script & Installation — manage the embed: the snippet, installation status per domain, allowed
      domains manager, framework guides, and a "test install" tool. Clear "Live vs Test" distinction.

   5. Widget Settings — full customization with a persistent LIVE PREVIEW (button + open modal + result
      view): button text, theme (accent, light/dark/auto, corner radius, font), locale + per-string
      overrides, result CTA (label + link), watermark toggle (locked on free plan), embed mode notes.

   6. Products — table/grid with search, category filter, status; add/edit product (name, category,
      image upload/URL, dimensions, SKU); bulk CSV import flow with mapping + validation results.
      Show a small "preview as it appears in the widget" affordance.

   7. Generations Gallery — browse results as a masonry/grid: each card shows before/after, product,
      date, status, 👍/👎 feedback. Filters (date, product, status). Detail view with full-size
      before/after slider and metadata. This is how merchants judge quality.

   8. Analytics — deeper than Overview: funnel over time, per-product performance, success/failure
      breakdown, device split, busiest times, and exportable views. Use clear, legible charts
      (line/area/bar/funnel). No chart-junk.

   9. Credits & Billing — credit balance with a clear "what's a credit" explainer; plan cards
      (Free / Starter / Growth / Scale / Enterprise) with a current-plan highlight and upgrade CTA;
      usage-vs-allotment meter; credit ledger/history table; invoices; "manage billing" (portal) entry.
      Low-credit warning banner pattern.

   10. Settings — team members & roles (Owner/Admin/Member), API keys (publishable/secret, test/live,
       "reveal once" + revoke), domains, account, danger zone (delete). Keys UI must communicate secrecy
       and safety clearly.

B) END-SHOPPER WIDGET EXPERIENCE — mobile-first, lives on the merchant's storefront
   This must feel magical and effortless; it runs inside a modal (and an inline variant).
   1. The trigger button (default style + how it adapts to merchant theme).
   2. Modal — Step 1: provide a room photo — large, friendly dropzone + "Take a photo" (camera) +
      "Upload"; show device-appropriate affordances; a reassuring privacy note. Include the camera
      capture screen and an image-confirm/crop state.
   3. Step 2: confirm product (thumbnail + name) and optional placement hint chips ("on the wall",
      "by the sofa", "on the floor").
   4. Generating state — a beautiful, calm progress experience (NOT a dull spinner): a "composing your
      room" animation with subtle stage hints; target feels < 15s. Design a graceful long-wait variant.
   5. Result — the signature BEFORE/AFTER reveal (draggable slider), with Save (download), Share, a
      "Try another photo" / "Regenerate" action, 👍/👎, and the merchant's result CTA button
      ("Add to cart"/"Request a quote"). This screen must delight and drive action.
   6. States: empty, uploading, error (bad image / failed generation / out of credits → friendly
      message), success, and the "Powered by LUMINA" footer (removable on paid tiers; watermark on free).
   7. Design the inline/embedded variant (same flow rendered inside a page container, not a modal).
   Mobile and desktop layouts for each widget state.

═══════════════════════════════════════════
DESIGN PRINCIPLES TO ENFORCE
═══════════════════════════════════════════
- The shopper flow must be usable by a non-technical person with zero instructions. Big tap targets,
  one obvious action per screen, plain language, zero jargon.
- The dashboard must make a busy merchant feel in control in 10 seconds: the answer to "is this working
  and is it worth it?" should be visible immediately.
- Accessibility: WCAG AA contrast, focus states, keyboard navigation, reduced-motion, proper labels.
- Consistency: every screen uses the same tokens, spacing rhythm, and components. Build a small but
  complete component library (buttons, inputs, tabs, cards, tables, modals, toasts, charts, KPI tiles,
  before/after slider, code-snippet block, plan card, credit meter, file dropzone, camera capture).
- Show realistic content (real-looking product names, room composites, numbers), never lorem ipsum.

═══════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════
1. A design tokens + foundations sheet (color, type, spacing, radius, elevation, motion).
2. The reusable component library.
3. High-fidelity screens for every item in scope (light + dark where it matters), mobile + desktop.
4. The end-to-end shopper flow as a connected sequence (trigger → photo → generating → before/after →
   CTA), shown on mobile.
5. The onboarding wizard as a connected flow with the live widget preview.

Start by proposing the foundations + 2–3 signature screens (Overview dashboard, Widget Settings with
live preview, and the shopper Result before/after) so we can lock the visual language. Then expand to
the full set. Keep it premium, spatial, and conversion-focused.
```

---

### How to use this
1. Paste the block above into Claude Design.
2. Lock the **foundations + 3 signature screens** first (Overview, Widget Settings, Shopper Result).
3. Then iterate screen-group by screen-group (Onboarding → Products/Gallery → Analytics → Billing →
   Settings → full Widget states).
4. Export tokens + components; we feed the same tokens into the `packages/ui` Tailwind theme so design and
   code share one source of truth.

# YuzuView — Functional Content Specification (for the Dashboard & Widget redesign)

> **Brand & naming (read first).** The product is being **renamed from "LUMINA" to "YuzuView."** Throughout
> this document the product is called **YuzuView**. Any remaining `LUMINA` / `Lumina` / `lumina` strings are
> **code-level technical identifiers** (e.g. `window.Lumina`, `data-lumina-*`, the `@lumina/*` packages, the
> `lumina-*` CSS classes, file paths like `docs/lumina/lumina.md`) and are **out of scope for the visual
> redesign** — leave them as-is. Every **user-facing brand reference** must read **YuzuView** (the dashboard
> wordmark, the auth screen, transactional emails, and the widget's **"Powered by YuzuView"** mark).
>
> **Design direction (the one place this doc speaks about visuals):** the whole design system — palette,
> logo/mark usage, typographic mood, and overall feel — must be **inspired by and derived from the new
> YuzuView logo and name**, supplied to Claude Design as a separate **logo image**. Let that logo be the
> source of truth for color and form. The name is a deliberate cue — **"yuzu"** (a fresh Japanese citrus) +
> **"view"** (preview / vision) — useful as mood, but the **provided logo image leads** the identity. Apart
> from this brand note, the rest of this document deliberately prescribes **only content and function**, not
> visual or layout decisions.

**Audience:** Claude Design (and any designer) who will produce a fresh visual + interaction design for
YuzuView's two front-end surfaces — the **merchant dashboard** and the **shopper widget**.

**What this document is:** an exhaustive description of **what each surface must contain and what it must
do** — every screen, section, field, button, action, and state, plus the data each shows and the real
copy it uses today. It is the *content and behaviour contract* for the redesign.

**What this document is deliberately NOT:** it gives **no visual or UX-styling instructions** — no colors,
spacing, typography, layout, component shapes, motion, or "where to put things." Those decisions are yours.
Where elements are grouped here, the grouping is *functional* (these things belong to the same job), not a
layout instruction. You may reorganize, merge, split, rename, or re-flow anything as long as the
**functions, data, and states below remain reachable**.

**How to read the call-outs:**
- Plain text = **as-built today** (live in the current product).
- 🚧 **Coming soon** = designed/planned but not yet active; design should leave room for it.
- 🛠 **Owner note** = an explicit improvement or known issue the owner wants addressed in the redesign.

---

## 1. What YuzuView is

YuzuView is a multi-tenant **"Visual Commerce" SaaS**. It adds a **"Try in your room"** capability to any
product. A person uploads a photo of a real **environment** — an **interior** (a room) **or an exterior**
(a facade, an entrance, a garden) — and an AI pipeline composites the **exact** product into that photo
with realistic placement, real-world scale, lighting, contact shadows, and perspective. The output is meant
to look like an unedited photograph of the customer's own space containing the real, purchasable product.

There are **two ways the magic moment is delivered**, and therefore **two front-ends to design**:

1. **The Widget** — an embeddable client that lives on a merchant's online storefront. A shopper, on their
   own, uploads a room photo and gets the composite. Self-service, public, mobile-first.
2. **The Dashboard** — the merchant's authenticated control plane. It configures the widget, manages the
   product catalog, shows analytics and billing — **and** contains **Studio**, a dashboard-native version of
   the same "try in your room" flow operated by a shop assistant for a walk-in customer in a physical store.

**Who it's for**
- **Online merchants** (furniture, lighting, doors/windows, kitchen/bath, tiles/renovation, decor, outdoor,
  mirrors, etc.) who install the widget.
- **Physical stores / showrooms** whose staff use **Studio** to render a preview for a customer standing in
  front of them, then email or save it.

**Business model — credits.** Each merchant is on a plan tier that grants a monthly credit allotment. **Each
generation costs 1 credit**, charged before the job runs; **a failed generation is automatically refunded**
(never billed). A repeated identical request returns the cached result for free.

---

## 2. The two products at a glance

| | **Widget (shopper)** | **Dashboard (merchant)** |
|---|---|---|
| **Who uses it** | End shoppers (anonymous), or a shop assistant in Studio | The merchant / their team (authenticated) |
| **Primary job** | Turn "what would this look like in my space?" into a believable image, then drive the next action (add to cart / contact) | Install & configure the widget, run Studio renders, judge quality, track ROI, manage catalog & billing |
| **Form factor** | Embedded modal (and an inline variant) inside someone else's website; runs in an isolated Shadow DOM | Full web app |
| **Priority** | **Mobile-first**, zero instructions, one obvious action per screen | **Desktop-first but fully responsive** (must work on tablet & phone) |
| **Languages** | 5 locales: English (default), Italian, German, French, Spanish — merchant-selectable, per-string overridable | English |
| **Relationship** | Its appearance/copy/CTA are configured in the dashboard's *Widget Settings*; every run it produces appears in the dashboard's *Generations* and *Analytics* | Studio reuses the exact widget generation pipeline |

---

## 3. Cross-cutting concepts the designer must understand

These appear across many screens; understanding them prevents mis-design.

- **Workspace = merchant = tenant.** One account today maps to one workspace (store). 🚧 Coming soon:
  multiple workspaces under one account, with a switcher.
- **Credit & plan.** Credits are the spendable unit. Plans: **Free (10/mo), Starter (250/mo, $49),
  Growth (1,200/mo, $199 — "Most popular"), Scale (6,000/mo, $799), Enterprise (25,000/mo, custom).**
- **Test / Live environment.** A Test/Live switch exists in the top bar. **Today only Live works** — Test is
  locked and opens an explainer dialog. 🚧 Coming soon: a real sandbox (test keys + isolated data). Design
  the toggle so a future working Test state fits naturally.
- **Product catalog.** Products have: name, image, category, optional external ID/SKU, optional real-world
  dimensions (W/H/D + cm|in). **Categories:** furniture, lighting, door, window, kitchen, bath, shower,
  tiles, mirror, decor, renovation, outdoor, fashion, other.
- **Placement hint.** Before generating, the shopper chooses where the product goes: **Auto, On the floor,
  On the wall, On a table, In the corner.**
- **Custom instructions.** A free-text field (≤ 280 chars) where the shopper can add specific guidance
  (e.g. "place it near the window, facing the room").
- **Coverage quantity (AI estimate).** For **coverage products** (categories: tiles, decor, renovation,
  outdoor) the AI also estimates **how many units** are needed to cover the surface (e.g. how many acoustic
  panels for a wall), comparing the product's real dimensions to the scene. It is shown as an **estimate**
  ("may not be 100% precise"). For non-coverage products (e.g. a single shower or wardrobe) the quantity is
  always 1 and no estimate is shown.
- **Result CTA.** A merchant-configured button shown on the result (e.g. "Add to cart" / "View product" /
  "Request a quote"). It opens a URL template with tokens `{productId}`, `{productUrl}`, `{quantity}`. When a
  coverage quantity is present, the chosen quantity feeds `{quantity}`.
- **Generation lifecycle / status.** A run is one of: **queued → processing → succeeded**, or **failed**, or
  **refunded**. Typical wait is **1–2 minutes**.
- **Branding / watermark.** A "Powered by YuzuView" mark appears in the widget; removable on Growth and above.
- **Roles.** owner / admin / member. 🚧 Coming soon: team invites (today the team list is read-only).
- **Notifications.** Only **actionable** alerts exist: **Failed previews, Low credits, Payment problems.**
  Each has in-app and email channels the merchant can toggle.
- **Privacy.** Room photos are people's homes/spaces; uploads are stripped of EXIF/GPS and inputs are
  intended to be moderated (reject non-environment photos like selfies/documents). The UI should treat the
  upload as sensitive and reassure the user.

---

# PART A — THE WIDGET (shopper experience)

## A1. Purpose & principles

The widget must let a **non-technical shopper, with zero instructions**, go from a product page to a
believable "in my space" image and then to action (add to cart / contact). It is embedded inside the
merchant's own website, so it must feel native to *their* store yet unmistakably trustworthy.

Hard product constraints the design must respect:
- **Mobile-first.** Most shoppers are on phones. Big tap targets, one obvious action per screen, plain
  language, no jargon.
- **Self-contained & isolated.** It renders inside a Shadow DOM — it cannot inherit or leak the host page's
  styles. The design is a closed system; it can't rely on the merchant's CSS.
- **Themeable.** It picks up the merchant's configured accent color, light/dark/auto mode, corner radius,
  font, button text, locale, and CTA (see Widget Settings, B11).
- **Resilient.** Network failures, bad images, and out-of-credit cases must degrade into friendly states.
- **Lean.** The whole app ships under a tight size budget — the design can't assume heavy assets/animation
  libraries.

## A2. The trigger / launcher button

The entry point on the storefront. Two forms:
1. **YuzuView-rendered launcher** — the merchant drops a placeholder and YuzuView paints its own styled button
   into it (carries the configured **button text**, default **"Try in your room"**, and theme).
2. **Merchant's own element** — any existing button on the page can become a trigger.

**Design needs:** a default launcher button design (with its label) and a sense of how it adapts to the
merchant's accent/radius/mode. It must read as "try this product in your space."

## A3. The modal shell

When triggered, the experience opens in a **modal/dialog** overlaying the storefront.
- **Mobile (< 640px):** behaves as a **bottom-sheet**; **Desktop (≥ 640px):** a **centered dialog**. Content
  scrolls within a max height (~92vh).
- Persistent chrome: a **Close (×)** control, and a **"Powered by YuzuView"** footer mark (toggleable per plan).
- The modal widens on the **Result** step (the before/after image is the hero there).
- 🚧 Inline/embedded variant: the same flow must also be designable **inside a page container** (not a modal)
  for merchants who embed it in the page body. Same steps, same states.

## A4. The step-by-step flow

The widget is a small state machine. The steps and their transitions:

`idle → upload → confirm → generating → result` · with `error` reachable from generating/submit, and
`Try again` returning to `confirm` (or `upload`).

### Step 1 — Upload (provide a room photo)
**Job:** get one good photo of the shopper's space.
**Must contain:**
- Title — default **"Add a photo of your room"**.
- A **dropzone** that is also a click target — copy **"Drag a photo here, or browse files"** (the
  "browse files" part is the affordance to open the file picker).
- A **"Use camera"** action (opens the camera capture sub-screen on supported devices; on mobile, falls back
  to the native camera capture).
- A **format/size hint** — default **"JPG, PNG or WebP · up to {max}"** (max is the merchant's upload limit).
- An **inline error** when a file is rejected (wrong type / too large): **"Please upload a clear photo of an
  interior room."**

**Camera capture sub-screen (when "Use camera" is used and supported):**
- A **live camera viewfinder** (rear camera preferred).
- **"Take photo"** (primary) and **"Close"** (cancel back to upload).
- A failure state if camera permission/feed is unavailable, with a way back.

### Step 2 — Confirm (product + placement + instructions)
**Job:** confirm what's being placed and how, then launch.
**Must contain:**
- Title — **"Place {product}"** (the product name).
- A **preview of the uploaded room photo**.
- **Placement label** — **"Where should it go?"** followed by a row of **placement chips**: **Auto · On the
  floor · On the wall · On a table · In the corner** (single-select; Auto = let the AI decide). The active
  chip is visibly selected.
- A **custom instructions** field — label **"Add specific instructions (optional)"**, a multi-line text box,
  placeholder **"e.g. place it near the window, facing the room"**, max 280 chars.
  - 🛠 **Owner note (known issues to fix in the redesign/build):** (1) this field currently **loses focus on
    every keystroke** — it must allow continuous typing; (2) it should be **expanded/visible by default**
    (inviting the shopper to write), not collapsed behind a tap.
- A primary **"Generate preview"** button (launches the run; the UI should move to the generating state the
  instant it's pressed, with no window to double-submit).

### Step 3 — Generating (calm progress)
**Job:** make a 1–2 minute wait feel intentional and reassuring (not a dull spinner).
**Must contain:**
- The shopper's room photo shown **dimmed in the background** ("we're working on *this*").
- A progress indicator + a **rotating stage hint** that reflects the real pipeline stage. Stage strings:
  - **"Checking your photo…"** (validate)
  - **"Isolating the product…"** (background removal)
  - **"Understanding your room…"** (scene analysis)
  - **"Placing the product…"** (compose)
  - **"Final checks…"** (moderation)
  - **"Almost there…"** (store)
- A title — **"Creating your preview…"** — and a time-expectation subtitle — **"This usually takes 1–2
  minutes."**
- Must include a **graceful long-wait** treatment (if it runs past expectations) that stays calm and never
  looks broken.

### Step 4 — Result (the payoff + the action)
**Job:** deliver the "wow," let them act, and capture feedback.
**Must contain:**
- The signature **before/after reveal**: a **draggable slider** comparing the original room (**"Before"**)
  with the composite (**"After"**). This is the hero of the screen.
- **Feedback** — 👍 / 👎 (aria labels "Looks great" / "Not quite"). After voting, the buttons are **replaced
  by a confirmation** — **"Thanks for the feedback!"** (this confirmation behavior is built; preserve it).
- **Action row:** **Save** (download the image), **Share** (native share / copy link), **Try again**
  (regenerate — costs a new credit; returns to confirm).
- **Coverage quantity block (only for coverage products):**
  - An **AI estimate label** — **"AI estimate: ~{qty}"**.
  - A **quantity stepper** (− / value / +), seeded with the AI's suggested quantity, editable down to 1.
  - A **note** — either the AI's rationale, or default **"An estimate — adjust the quantity if needed."**
- **Result CTA button (only if the merchant configured one):** label is merchant-defined (e.g. **"Add to
  cart"**). Pressing it performs the merchant's configured action (opens the add-to-cart / product URL,
  passing the chosen quantity) **and** emits a `cta:click` event.
  - 🛠 **Owner note (known issue):** today the CTA reliably fires the analytics event but the **add-to-cart
    action itself does not actually add the product** on at least one tested storefront. The redesigned
    result CTA must *actually* perform the add-to-cart (honoring the selected quantity), not just log the
    click. Treat "CTA completes the purchase intent" as a first-class success state worth designing for
    (e.g. a confirmation/echo that it worked).

### Error states
A single error screen renders one of three friendly kinds (title + body + a **"Try again"** button):
- **Bad image** — "We couldn't use that photo" / "Please upload a clear photo of an interior room."
- **Generation failed** — "Something went wrong" / "We couldn't create your preview. Please try again."
- **Out of credits** — "Previews are paused" / "This store has run out of previews for now. Check back soon."

## A5. Full widget states inventory (design each)
- **Trigger/launcher** (default + themed)
- **Upload** (idle, drag-over, file rejected/error)
- **Camera capture** (viewfinder, failed/permission denied)
- **Confirm** (with/without placement selected, with/without instructions)
- **Generating** (each stage hint; long-wait variant)
- **Result** (with CTA / without CTA; with coverage quantity / without; pre-vote / post-vote "thanks")
- **Errors** (bad image / failed / out of credits)
- **Powered-by footer** (shown on free; hidden on paid)
- **Inline/embedded variant** of all of the above

## A6. Widget copy reference (current English defaults — real content, not lorem ipsum)
Use these as the realistic content. All are merchant-overridable per-string and translated into it/de/fr/es.

| Key | English copy |
|---|---|
| Trigger button | Try in your room |
| Close | Close |
| Powered-by | Powered by YuzuView |
| Upload title | Add a photo of your room |
| Upload dropzone | Drag a photo here, or **browse files** |
| Use camera | Use camera |
| Upload hint | JPG, PNG or WebP · up to {max} |
| Camera capture | Take photo |
| Confirm title | Place {product} |
| Placement label | Where should it go? |
| Placement chips | Auto · On the floor · On the wall · On a table · In the corner |
| Generate button | Generate preview |
| Instructions label | Add specific instructions (optional) |
| Instructions placeholder | e.g. place it near the window, facing the room |
| Generating title | Creating your preview… |
| Generating subtitle | This usually takes 1–2 minutes. |
| Stage hints | Checking your photo… / Isolating the product… / Understanding your room… / Placing the product… / Final checks… / Almost there… |
| Result title | Here's your room |
| Before / After | Before / After |
| Result actions | Save / Share / Try again |
| Coverage estimate | AI estimate: ~{qty} |
| Coverage note | An estimate — adjust the quantity if needed. |
| Feedback | 👍 Looks great / 👎 Not quite → Thanks for the feedback! |
| Error: bad image | We couldn't use that photo / Please upload a clear photo of an interior room. |
| Error: failed | Something went wrong / We couldn't create your preview. Please try again. |
| Error: out of credits | Previews are paused / This store has run out of previews for now. Check back soon. |
| Retry | Try again |

🛠 **Owner note:** parts of the widget have been observed rendering in **Italian when they should default to
English**. The default locale must be English; other languages appear only when the merchant selects them or
the host page declares the language. Ensure the design's copy is language-driven, never hard-coded.

## A7. Widget responsiveness
- Mobile-first; **bottom-sheet < 640px, centered dialog ≥ 640px**; content scrolls within ~92vh.
- Must be fully usable on phone, tablet, and desktop. Camera/upload affordances should adapt to device.

---

# PART B — THE DASHBOARD (merchant control plane)

## B1. Purpose & principles
A busy merchant should be able to answer **"is this working, and is it worth it?"** within seconds, and a
non-technical merchant should be able to **install and configure** the widget without help. The dashboard
is desktop-first but **must be fully responsive** (the owner explicitly wants it verified across PC, tablet,
and phone). It also hosts **Studio** (the physical-store use case), which is a primary surface, not an
afterthought.

## B2. Global shell

Every authenticated screen sits inside a shell with three persistent regions:

### B2.1 Sidebar (primary navigation)
- **Workspace switcher** (top): the current store's mark + name + plan (e.g. "Acme · Growth plan"). Opens a
  menu with the current workspace, a **"Workspace settings"** link, and the note **"Multiple stores on one
  account — coming soon."** 🚧 Coming soon: actually switching between multiple workspaces.
- **Navigation**, grouped:
  - **(main, ungrouped):** Overview · Studio · Generations · Products · Analytics
  - **Configure:** Script & install · Widget settings · Credits & billing · Settings
  - Each item has an icon and label; the active item is highlighted; items may show a **count badge**.
- **Credit pill** (footer): "Credits remaining," the numeric balance, a **% used** badge, and a usage meter.
  Links to Billing. Has visual urgency levels (ok / warning / danger).
- **Account row** (footer): avatar initials, name, email. Links to settings.

### B2.2 Topbar
- A **navigation toggle** (hamburger) that opens the sidebar as a drawer on small screens.
- The **current screen title** (derived from the active nav item).
- **Environment toggle** — **Live** (active) and **Test** (locked → opens the "Test environment isn't
  available yet" explainer dialog). 🚧 Coming soon: working Test.
- **Theme toggle** — light / dark for the dashboard itself.
- **Notifications bell** — unread badge; opens the notifications dropdown (see B13).
- **Account menu** — Account settings, Credits & billing, Sign out.

### B2.3 Global states the design must cover
- **Empty states** (each list/section has a meaningful one — examples given per screen below).
- **Loading skeletons.**
- **Inline notices / toasts** for success, info, and error (e.g. "All changes saved," "Checkout cancelled,"
  error messages).
- **404 / not-found** (branded).
- **Responsive shell:** > 1024px sidebar is a fixed column; ≤ 1024px it collapses to an off-canvas drawer
  opened from the hamburger (with a dismiss scrim, closes on navigation).

## B3. Authentication (login / sign-up)
A single auth screen (unauthenticated).
- Brand mark + subtitle ("Sign in to your merchant dashboard.").
- **Email** + **Password** fields.
- Two actions: **Sign in** (primary) and **Create account** (secondary) — same form.
- A divider ("or") then **Continue with Google** (OAuth).
- **Inline error** display.
- 🚧 Owner note: a richer flow (forgot/reset password, a premium split-layout with a spatial visual) was in
  the original design intent — design space for forgot-password is welcome.

## B4. Onboarding (guided setup checklist)
**Purpose:** get a new merchant from zero to a live widget. It's a **checklist whose completion is derived
from real signals** (not manual checkboxes).
**Must contain:**
- A header that switches between **"Get YuzuView live"** (in progress) and **"You're all set"** (done), with a
  **progress meter** (e.g. "2 / 5").
- An **"Up next" focus card** highlighting the current step with its icon, title, body, and a primary CTA
  that deep-links to the relevant screen.
- The **full step list** (each: number/checkmark, title, body, and a CTA when incomplete). The five steps:
  1. **Account** (set up the workspace)
  2. **Configure** (the widget settings)
  3. **Products** (add at least one product)
  4. **Install** (paste the script / detect impressions)
  5. **Go live** (first generation)
- A **completed/celebration state** with a "Go to Overview" CTA.

## B5. Overview (the ROI dashboard)
**Purpose:** answer "is it working and worth it?" instantly. Default screen after login.
**Must contain:**
- A **banner** (contextual; e.g. install/domain reminders, current date range).
- A **KPI row** of four tiles, each with a value, a **delta vs. the previous period**, and (where relevant) a
  **sparkline**:
  - **Generations** (count + sparkline)
  - **Success rate** (% + "pts vs last period")
  - **CTA clicks** (count + "% of results" + sparkline)
  - **Credits remaining** (balance + "% used" + reset date)
- **"Generations over time"** — a timeseries chart with two series (**Generations** and **CTA clicks**) + a
  legend. Empty state: "No activity in this period."
- **Conversion funnel** — four stages with bars, absolute values, and conversion rates:
  **Impressions → Opens → Generations → CTA clicks.** (Labeled "30 days.")
- **Top products** — best-performing products list.
- **Recent strip** — the latest generations as a quick visual row.
- Empty/error state: "Analytics are warming up."

## B6. Studio (the physical-store use case) — a navigable section with sub-tabs
**Purpose:** let shop staff run "try in your room" for a walk-in customer **directly in the dashboard**
(no widget, no shopper device), then **email or save** the result, optionally filed under a **client**.
Sub-navigation tabs: **Overview · New visualization · Clients.** (The sidebar keeps a single "Studio" item
active.)

### B6.1 Studio — Overview
- A **hero** with title "Studio," a one-line explainer, and a primary **"New visualization"** CTA.
- **Headline stats:** Clients (count) · Client renders (count) · Credits left.
- **Recent renders** panel (grid of recent Studio results) with a "New →" link. Empty: "No renders yet."
- **Recent clients** panel (up to 5, each: avatar, name, contact line, render count) with an "All clients →"
  link. Empty: "No clients yet."

### B6.2 Studio — New visualization (the in-dashboard generation wizard)
A single-screen flow with three phases: **compose → generating → result.**
**Compose phase must contain:**
- **Client (optional):** a dropdown of existing clients ("No client" allowed) + a **"+ New client"** toggle
  that reveals an inline mini-form (Name required; Email optional; Phone optional; **Save client**).
- **Product:** a dropdown of catalog products. If none exist: a prompt linking to Products.
- **Room photo:** an upload control (click to choose a file; shows "Uploading…"); once uploaded, shows a
  **preview** with a **"Choose another"** option.
- A primary **"Generate visualization"** button (enabled only when a product + room photo are present).
- Inline error messages (out of credits / product not found / failure → "Your credit was refunded.").

**Generating phase:** button shows "Generating…" + hint **"This usually takes 1–2 minutes."**

**Result phase must contain:**
- Title "Your visualization" (+ "For {client name}" when a client is selected).
- The **before/after** comparison.
- **Coverage quantity** badge when present — e.g. "≈ 12 pcs" + "estimated to cover the surface" (+ rationale).
- **Action row:** **Download** · **Email to client** (primary; disabled while sending; becomes "✓ Emailed";
  the emailed link is a 7-day link) · **View client** (if a client is attached) · **New render** (reset).
- Helper hints: success ("Sent to {email}."), and a tip to link a client with an email if none is set.

### B6.3 Studio — Clients (the client address book)
- A **toolbar:** a **search** field ("Search clients…") + **"Add client"**.
- A **table** of clients: Client (avatar + name, links to detail) · Contact (email/phone) · Renders (count) ·
  Last activity (date) · row actions **Edit** / **Delete**.
  - Delete is guarded with a confirm ("Their renders stay on file but lose the link.").
- Empty state: "No clients yet" + an "Add client" CTA. "No clients match your search" when filtered.
- **Add/Edit client** is a side **drawer** (Name, Email, Phone, Notes).

🛠 **Owner note:** the owner asked whether the **search bar is needed** in places where it isn't pulling
weight. Keep search where the list can grow (Clients, Products); consider dropping it where lists are short.

### B6.4 Studio — Client detail
- A **back link** ("← All clients").
- A **client header:** avatar, name, contacts (clickable email, phone, or "No contact details"), and actions
  **"New visualization"** (deep-links to the wizard pre-filled with this client) and **"Edit"** (opens the
  drawer).
- **Notes** block (if any).
- **Visualizations** — this client's render history as a grid with "load more."

## B7. Generations (quality gallery)
**Purpose:** how the merchant judges output quality and inspects individual runs.
**Must contain:**
- **Status filter chips:** All · Queued · Processing · Succeeded · Failed · Refunded.
- A **card grid** — each card: result thumbnail (or a status-colored fallback), a **status badge**, the
  **product name**, and the **date**. Cards are clickable.
- A **"Load more"** control (cursor pagination).
- Empty state: "No generations yet."
- A **detail modal** (on card click): the **before/after** comparison + a metadata block —
  **Category, Model, Latency, Credits, Cost, Placement, Created**, and (if present) **Error code** and
  **Page URL**.

## B8. Products (catalog management)
**Purpose:** maintain the catalog shoppers can try on.
**Must contain:**
- A **toolbar:** **search** ("Search products…") · **category filter** (All categories + each category) ·
  **"Import CSV"** · **"Add product"**.
- A **table:** Product (thumbnail + name) · Category (badge) · External ID · Added (date) · row actions
  **Edit** / **Archive** (soft-delete).
- Empty state: "No products yet." "No products match your filters." when filtered.
- **Add/Edit product drawer** (side panel): Name · Image URL (with a live image preview when set) ·
  Category (select) · External ID / SKU · **Dimensions (optional)**: W / H / D + unit (cm | in). Primary
  action **Add product** / **Save changes** (disabled until name + image present).
- **Import CSV modal:** explains the columns (name, imageUrl|image, optional category, externalId; "rows are
  upserted by external ID"), a **file chooser**, a parsed-result **summary** ("N valid" / "N skipped"
  badges), a **per-row error list**, an example/sample (collapsed), and an **"Import N"** action.

> Note on dimensions: dimensions feed the **coverage quantity** estimate (B/A3), so the form should make
> entering W/H/D feel worthwhile for coverage products.

## B9. Analytics (deeper than Overview)
**Purpose:** trends over time.
**Must contain:**
- A **range selector:** 7 days · 30 days · 90 days (with the resolved date range shown).
- The same **KPI row** as Overview (Generations, Success rate, CTA clicks, Credits remaining).
- **"Generations & CTA over time"** timeseries (two series + legend; day or week interval).
- **Conversion funnel.**
- **Top products.**
- Empty/warming-up states as in Overview.

## B10. Script & Install
**Purpose:** get the embed onto the storefront. Two views with back-navigation between them.

### B10.1 Platform picker (landing view)
- An intro line ("Choose where you're installing YuzuView…").
- A **grid of platform cards**, each with a brand icon, name, and one-line blurb:
  - **Script — any platform** — *available, clickable* ("Paste one `<script>` line. Works on any website or
    CMS.").
  - **WordPress, Shopify, WooCommerce, Wix, Squarespace** — each **"Coming soon"** (disabled), with its
    brand icon and a blurb (one-click plugin / app store block / extension, etc.).
- 🚧 Only the generic Script card is active today; the per-platform installers are planned.

### B10.2 Install guide (opens from the Script card)
- A **"← All platforms"** back button.
- A header noting the current environment (**Live**/Test) with a key badge.
- **Step 1 — Add the script:** an explanatory line, a **copyable code block** containing the loader
  `<script>` (with the merchant's real publishable key baked in when available), and a contextual note about
  the key (it's public by design; manage in Settings; or "create one in Settings → API keys").
- **Step 2 — Place the button:** an explanatory line + a **copyable code block** with the trigger/placeholder
  snippet (showing `data-lumina-product`), and a note about using your own button or `window.Lumina.open(...)`.
- **Step 3 — Verify it's live:** a checklist (click the button → modal appears; allow-list your domain in
  Settings → Domains or requests are blocked; watch runs appear in Generations and metrics in Overview).

## B11. Widget Settings (configure the shopper widget)
**Purpose:** customize how the widget looks, reads, and behaves — with a **live preview of the real widget**.
**Layout is two regions functionally: a settings column + a persistent live preview.**

**A save/status bar:** shows **"Unsaved changes" / "All changes saved"** (or an error), with **Discard** and
**Save changes** actions.

**Settings groups (each a labeled section):**
1. **Trigger button** — **Button text** (≤ 32 chars; "Shown on the storefront launcher").
2. **Theme** (tagged "Live preview →"):
   - **Accent color** — a row of preset swatches + a **custom hex** picker ("Drives buttons, links & the
     result CTA").
   - **Appearance** — a segmented control: **Light / Dark / Auto** ("Auto follows the visitor's system").
   - **Corner radius** — a slider (0–24 px) with a live value.
   - **Font family** — a select (YuzuView default / inherit host serif / monospace; "Default inherits the host
     site's font").
3. **Locale & copy:**
   - **Default locale** — select (English (US), Italiano, Deutsch, Français, Español; "Auto-detected from
     `<html lang>`").
   - **String overrides** — editable fields for key widget labels (Upload title, Upload hint, Generate
     button, Result title), each showing the shipped default as placeholder ("Override any widget label").
4. **Result CTA:**
   - **Quick-fill presets** — a row of platform buttons (**Shopify, WooCommerce, Wix, Generic link**), each
     with its brand icon; tapping one **auto-fills** the two fields below with that platform's typical
     add-to-cart/product link (the merchant can still edit).
   - **CTA label** (≤ 24 chars; placeholder "Add to cart"; "Emits cta:click on tap").
   - **Link template** (placeholder "/cart/add?id={productId}"). Supports tokens `{productId}`,
     `{productUrl}`, `{quantity}`.
5. **Branding:**
   - **Show "Powered by YuzuView"** — a toggle ("Removable on Growth & above").

**Live preview (persistent):** renders the **actual widget** themed from the unsaved form, with a segmented
control to switch the previewed state: **Button · Modal · Result.** A caption clarifies "The actual widget ·
changes apply live, not yet saved," plus a Live/Test env badge.

## B12. Credits & Billing
**Purpose:** understand and manage spend.
**Must contain:**
- **Status notices** after returning from checkout ("Subscription updated…", "Checkout cancelled…", or an
  error).
- **Credit summary card:** Credits remaining (big number), "N of M used this cycle · resets {date}," a usage
  **meter** (ok/warn/danger), and a **"Manage billing"** button (opens the Stripe customer portal).
- **Plan cards** for all tiers (Free / Starter / Growth / Scale / Enterprise): name, price (/mo), included
  credits, a **feature list**, and a context-aware action — **Current plan** (disabled), **Upgrade**,
  **Switch**, or **Contact sales** (Enterprise). The "Most popular" plan (Growth) carries a ribbon.
- **Credit ledger table:** Reason (Purchase / Grant / Generation / Refund / Adjustment / Expiry) · Note ·
  Date · Amount (+/−). Empty: "No credit activity yet."
- A **low-credit warning** pattern (the balance crosses a threshold).

## B13. Settings
A stack of sections:
1. **Account:** editable **Store name** (with Save); read-only **Workspace** (slug), **Signed in as**
   (email), **Plan** (+ "Manage" link to Billing).
2. **API keys:** explainer (publishable `pk_` go in the widget; secret `sk_` are server-only; full value
   shown once). A **create row** (kind: Publishable/Secret · env: Test/Live · **Create key**). A **table** of
   active keys (masked prefix · Type · Env badge · Last used · **Revoke**). A **reveal-once modal** after
   creation ("This is the only time the full key is shown") with a copy control.
3. **Allowed domains:** explainer (the widget only runs on these domains; `*.` for subdomains). An **add**
   field + button, a **list** with per-item remove. Empty: "the widget is blocked until you add one."
   Validation errors inline.
4. **Notifications:** a per-type matrix of **In-app** / **Email** toggles for: **Failed previews**, **Low
   credits**, **Payment problems** (each with a short description). A **Save preferences** action with a
   "Saved" confirmation.
5. **Team:** a list of members (email, **role** badge, joined date). 🚧 Tagged **"Invites coming soon"** —
   today read-only. The redesign should design the **invite member** flow (invite by email, assign
   owner/admin/member) so it can be enabled.
6. **Danger zone:** **Cancel subscription** (→ Manage billing) and **Delete account & data** (opens a
   **type-to-confirm** modal requiring the exact store name; irreversible erasure).

## B14. Notifications (top-bar dropdown)
- Bell with an **unread count** badge ("9+" cap).
- A dropdown: header "Notifications" + **"Mark all read"** (when unread > 0), then a list of items (each:
  unread dot, title, relative time like "5m"/"3h"/"2d", optional body). Empty: "You're all caught up — no
  notifications yet." Refreshes periodically.

## B15. Dashboard responsiveness (explicit owner requirement: verify on PC, tablet, phone)
- **> 1024px:** sidebar is a fixed column; KPI grid 4-up; editor screens two-column (settings + preview).
- **≤ 1024px:** sidebar collapses to an off-canvas drawer (hamburger + scrim, closes on navigation); KPI grid
  2-up; Widget Settings stacks (form then preview); wide tables scroll horizontally.
- **≤ 560px:** KPI grid 1-up; multi-field rows wrap. Every table, drawer, and modal must remain usable on a
  phone.

---

# PART C — Component vocabulary the design must provide

A small but complete, consistent component library is reused across both products. Design these once and
reuse:

- **Buttons:** primary, secondary, ghost, danger; sizes incl. small; disabled/loading ("Saving…", "Loading…").
- **Inputs:** text, textarea (with char limits), select, color picker, range slider, file chooser/dropzone,
  toggle switch, checkbox.
- **Segmented control** (e.g. Light/Dark/Auto; preview Button/Modal/Result).
- **Chips** (placement chips; status/filter chips with active state).
- **Badges:** neutral, accent, success, warning, danger, live, test (with status dot).
- **Cards** (with header + body); **stat tiles / KPI tiles** (value + delta + sparkline).
- **Tables** (sortable-feeling, horizontally scrollable on small screens) with **row actions**.
- **Side drawers** (product, client) and **modals** (import, reveal key, delete-confirm, env explainer,
  generation detail) — with scrim, close, footer actions.
- **Meters / progress bars** (credit usage with ok/warn/danger levels).
- **Charts:** timeseries (line/area, multi-series + legend), **conversion funnel**, **sparklines**.
- **Before/after slider** (used in widget result, Generations detail, Studio result) — the signature element.
- **Code block** with a copy button.
- **Plan card** (price, credits, features, contextual CTA, "Most popular" ribbon).
- **Empty states** (icon + title + body + optional action) and **loading skeletons**.
- **Menus / dropdowns** (workspace switcher, account menu, notifications).
- **Notices / toasts** (success / info / danger).
- **Avatar** (initials) for accounts and clients.

---

# PART D — Consolidated roadmap & known issues (owner notes)

Design with these in mind so the new design accommodates them without rework.

**🚧 Planned / coming soon (leave room in the design):**
1. **Multiple workspaces** under one account, with a working switcher (sidebar already hints at it).
2. **Team invites** (invite by email; owner/admin/member) — Settings → Team currently read-only.
3. **Per-platform installers** (WordPress / Shopify / WooCommerce / Wix / Squarespace) — Script & Install
   cards currently "Coming soon."
4. **Working Test environment** (sandbox keys + isolated data) — the Live/Test toggle's Test side is locked
   today.
5. **Inline/embedded widget variant** (the flow inside a page container, not just a modal).

**🛠 Known issues / improvements to address in the redesign (and build):**
1. **Widget language:** default to **English**; some strings have shown in Italian incorrectly.
2. **Custom-instructions field:** must not lose focus while typing, and should be **expanded by default**
   (inviting input), not collapsed.
3. **Processing expectation:** keep the explicit **"1–2 minutes"** message during generation (already added).
4. **Result CTA / Add to cart:** must **actually add the product to cart** (with the chosen quantity), not
   only fire the analytics event — currently broken on at least one storefront.
5. **Feedback confirmation:** keep replacing 👍/👎 with a **"Thanks for the feedback!"** confirmation
   (already added) so the shopper knows it registered.
6. **Search bars:** keep search only where lists are large (Products, Studio Clients); drop where it adds no
   value.
7. **Responsiveness:** verify the **entire dashboard and widget** work well on **PC, tablet, and phone**.

**✅ Already built (do not regress — these are real, current features the design must preserve):**
- AI **coverage-quantity** estimate + quantity stepper feeding the CTA (widget) and quantity badge (Studio).
- **Studio** end-to-end (clients, in-dashboard generation, email/download result).
- **Placement chips** + **custom instructions** in the widget confirm step.
- **Notifications** (bell + per-type in-app/email preferences).
- **Result CTA platform quick-fill presets** in Widget Settings.
- **Script & Install** platform-picker → guide with back navigation.

---

*Source of truth for behavior is the codebase (`apps/dashboard`, `apps/widget`) and the canonical spec
`docs/lumina/lumina.md`. This document intentionally describes content and function only; all visual and
interaction design is open.*

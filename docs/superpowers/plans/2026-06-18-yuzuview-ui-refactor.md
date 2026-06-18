# YuzuView UI/UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, batch execution — the owner pre-approved autonomous phase-by-phase execution with commits between phases and no review pause). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the dashboard and widget to the YuzuView visual language in `docs/design/v2`, rebrand user-facing LUMINA→YuzuView, make both surfaces fully responsive, and remove dead UI code — without changing any back-end or AI logic.

**Architecture:** Keep the existing vanilla-CSS + CSS-custom-property architecture. Shared token/component layers live in `packages/ui/styles/*`; the dashboard composes per-route `*.css`; the widget styles itself inside its Shadow DOM via `src/ui/styles.css` + `theme.ts`. The `.dc.html` prototypes are the pixel source of truth, consulted per task.

**Tech Stack:** Next.js 15 (dashboard), Preact + Vite (widget), vanilla CSS, `next/font`, Vitest, Playwright.

## Global Constraints

- User-facing brand = **YuzuView**. Code identifiers stay `lumina`: `window.Lumina`, `data-lumina-*`, `@lumina/*`, `lumina-*` CSS classes, `LuminaController`, `lumina:*` events, file paths. (spec §2)
- Do NOT change: DB queries/RLS/migrations, R2 keys, `AIOrchestrator`/Inngest/`packages/ai`, API routes, `actions.ts` server logic (copy strings only), the widget public contract. (spec §3)
- Dashboard copy: English. Widget: English **default**, keep it/de/fr/es locales. (spec §1)
- Widget app bundle **< 45 KB gzipped**; all widget UI inside Shadow DOM; single `window.Lumina` namespace. (CLAUDE.md rule 7)
- No new UI framework (no Tailwind). Keep `@lumina/ui` import surface (`styles/index.css`) stable. (spec §2)
- Every phase ends green: `pnpm lint && pnpm typecheck && pnpm test`; widget also `test:e2e` + bundle-size. Conventional Commits. (spec §5)
- Palette/type/spacing values: verbatim from spec §4 / Foundations `.dc.html`.

---

## File Structure

**packages/ui/styles/** — shared design system
- `tokens.css` — all CSS custom properties (light + dark, fonts, spacing, radius, elevation)
- `components.css` — reusable component classes (buttons, inputs, chips, badges, cards, KPI, meter, table, drawer, modal, toast, dropzone, skeleton, code block, plan card, before/after, segmented, avatar)
- `app.css` — base/reset + app-level layout primitives
- `index.css` — aggregator (import order: tokens → app → components); import surface unchanged

**apps/dashboard/src/** — composes the system
- `app/layout.tsx` — fonts via `next/font`, metadata rebrand, theme attr
- `components/shell/*` — Sidebar, Topbar, EnvToggle, ThemeToggle, NotificationsBell
- `components/ui/*` — Icon, Menu, EmptyState, Skeleton, CopyButton, BrandIcon, ProductThumb (+ new BrandMark)
- `components/overview/*` — KpiRow, TimeseriesChart, FunnelCard, TopProducts, RecentStrip, Banner
- `app/(app)/<route>/*.tsx` + `<route>/*.css` — per screen
- `app/login/*` — auth

**apps/widget/src/** — Shadow-DOM client
- `ui/styles.css` — all widget CSS (Shadow DOM scoped)
- `ui/theme.ts` — token defaults / theme mapping
- `ui/App.tsx`, `ui/Modal.tsx`, `ui/BeforeAfter.tsx`, `ui/steps/*` — restyle
- `core/i18n.ts` — locale strings (poweredBy rebrand; default English)

**apps/api/src/lib/email/** , **lib/generations/email.ts** — brand text strings only

---

# PHASE 1 — Design system foundation

**Deliverable:** new YuzuView tokens + component library + fonts + brand assets wired in; dashboard still builds; all existing tests green. No screen visually finished yet, but the primitives exist.

### Task 1.1: Rewrite design tokens

**Files:**
- Modify: `packages/ui/styles/tokens.css`
- Reference: `docs/design/v2/project/YuzuView - Foundations & Signatures.dc.html` (root `<div style>` token block, lines ~24; dark ramp lines ~113-118)

**Interfaces:**
- Produces: CSS custom properties consumed by every other CSS file: `--brand`, `--brand-600/700/300/100/50`, `--fruit`, `--plum`, `--ink`, `--ink-2`, `--muted`, `--faint`, `--line`, `--line-2`, `--surface`, `--surface-2`, `--canvas`, `--success`(+`-100`), `--warning`(+`-100`), `--danger`(+`-100`), `--e1/e2/e3`, `--font-ui`, `--font-mono`, radius scale `--r-8/12/16/22`, spacing scale.

- [ ] **Step 1:** Read the existing `tokens.css` to learn the current variable names the dashboard already consumes (e.g. `--font-ui`), so renames don't break consumers. Keep the same variable *names* the dashboard uses where they exist; add the new YuzuView *values*.
- [ ] **Step 2:** Write `:root` light tokens with the exact hex values from spec §4. Map font tokens: `--font-ui` → Hanken Grotesk stack, `--font-mono` → JetBrains Mono stack. Add spacing (`--s-1:4px … --s-12:48px`), radius (`--r-8…--r-22`), elevation (`--e1/--e2/--e3`).
- [ ] **Step 3:** Add `[data-theme="dark"]` overrides (canvas `#100E17`, surface `#1A1822`, surface-2 `#221F2D`, brand `#8E86F2`, plus dark line/ink/muted values that keep WCAG AA — derive ink `#F3F2F8`, muted `#8A8698`, line `#2A2735`).
- [ ] **Step 4:** Add the keyframes used by the system (`yzShim`, `yzSpin`, `yzPulse`, `yzRise`) and the `prefers-reduced-motion` guard, if not better placed in `app.css` (put global keyframes in `app.css`; keep tokens.css variables-only). Move keyframes to Task 1.3.
- [ ] **Step 5:** `pnpm -F @lumina/ui build` — expect success.
- [ ] **Step 6:** Commit: `style(ui): YuzuView design tokens (light + dark)`

### Task 1.2: Rewrite component library CSS

**Files:**
- Modify: `packages/ui/styles/components.css`
- Reference: Foundations `.dc.html` "COMPONENT LIBRARY" block (lines ~186-356) for exact paddings/radii/weights.

**Interfaces:**
- Produces: class names consumed by dashboard markup. Define a consistent set: `.btn`, `.btn--primary/secondary/ghost/danger/sm`, `.btn[disabled]` + `.btn__spinner`; `.field`, `.field--invalid`, `.input`, `.textarea`, `.select`, `.color-picker`, `.range`, `.toggle`, `.checkbox`; `.segmented` + `.segmented__item[aria-selected]`; `.chip` + `.chip[aria-pressed]`; `.badge`, `.badge--neutral/accent/success/warning/danger`, `.badge--live/test` (with dot); `.card`, `.card__header`, `.card__body`; `.kpi`, `.kpi__delta`; `.meter` + `.meter__fill[data-level=ok|warn|danger]`; `.table`, `.table__row`, `.row-actions`; `.drawer`, `.drawer__scrim`; `.modal`, `.modal__scrim`; `.toast`, `.toast--success/info/danger`; `.dropzone`; `.skeleton`; `.code-block` + `.code-block__copy`; `.plan-card` + `.plan-card__ribbon`; `.avatar`; `.empty`.

- [ ] **Step 1:** Map every component in the Foundations library to a class with the exact values shown (e.g. primary button: `background:var(--brand);color:#fff;font:600 14px/1 var(--font-ui);padding:11px 18px;border-radius:10px;box-shadow:var(--e1)`).
- [ ] **Step 2:** Ensure each interactive component has `:hover`, `:focus-visible` (4px `--brand-100` ring as in the input example), and disabled states.
- [ ] **Step 3:** `pnpm -F @lumina/ui build` — success.
- [ ] **Step 4:** Commit: `style(ui): YuzuView component library classes`

### Task 1.3: Base/app CSS + keyframes + index aggregation

**Files:**
- Modify: `packages/ui/styles/app.css`, `packages/ui/styles/index.css`

- [ ] **Step 1:** In `app.css`: reset (`*{box-sizing}`, body margin/font-smoothing), base `body{font-family:var(--font-ui);color:var(--ink);background:var(--canvas)}`, the canvas radial-gradient background, the four keyframes, and reduced-motion guard.
- [ ] **Step 2:** Confirm `index.css` imports in order tokens → app → components and that the `@lumina/ui` package export still points to it (no path change).
- [ ] **Step 3:** `pnpm -F @lumina/ui build` + `pnpm -F @lumina/dashboard typecheck` — success.
- [ ] **Step 4:** Commit: `style(ui): YuzuView base layer + keyframes`

### Task 1.4: Fonts (dashboard) + brand assets

**Files:**
- Modify: `apps/dashboard/src/app/layout.tsx`
- Create: `apps/dashboard/public/yuzuview-logo.png`, `apps/dashboard/public/yuzuview-mark.png` (copy from `docs/design/v2/project/assets/`)
- Create: `apps/dashboard/src/components/ui/BrandMark.tsx` (inline SVG/img wordmark + mark, used by Sidebar + auth)

- [ ] **Step 1:** Copy the two PNG assets into `apps/dashboard/public/`.
- [ ] **Step 2:** In `layout.tsx`, load `Hanken_Grotesk` and `JetBrains_Mono` via `next/font/google`, expose them as CSS variables (`--font-ui`, `--font-mono`) on `<html>`/`<body>`, and update metadata title/description to YuzuView.
- [ ] **Step 3:** Create `BrandMark.tsx` exporting `<BrandWordmark/>` and `<BrandIcon/>` (mark). Use the PNGs or inline the mark SVG.
- [ ] **Step 4:** `pnpm -F @lumina/dashboard typecheck` + `pnpm -F @lumina/dashboard test` — green (nav.test unaffected).
- [ ] **Step 5:** Commit: `feat(dashboard): Hanken Grotesk + JetBrains Mono fonts and YuzuView brand assets`

**Phase 1 gate:** `pnpm lint && pnpm typecheck && pnpm test` green. Commit any remainder. Continue to Phase 2.

---

# PHASE 2 — Dashboard restyle + rebrand + responsive

**Deliverable:** every dashboard screen matches the YuzuView prototype, English copy, responsive at >1024 / ≤1024 / ≤560, dark mode working, old per-route CSS replaced. Each task = one screen/area, ends with lint+typecheck+test green and a Conventional Commit. Each task: (a) read the matching `.dc.html` section, (b) rewrite markup classes + per-route CSS to the system, (c) apply responsive rules, (d) rebrand strings, (e) delete now-dead CSS, (f) verify.

Prototype map (`docs/design/v2/project/`): `Sidebar.dc.html`; `YuzuView - Dashboard.dc.html` sections AUTH(29) · ONBOARDING(64) · STUDIO(115) · STUDIO CLIENT DETAIL(219) · GENERATIONS(262) · PRODUCTS(322) · ANALYTICS(372) · SCRIPT picker(429) · SCRIPT guide(475) · BILLING(512) · SETTINGS(550) · MODALS&MENUS(622) · STATES(689); `YuzuView - Foundations & Signatures.dc.html` Signature 01 = Overview (367).

- [ ] **Task 2.1 — Shell: Sidebar.** Files: `components/shell/Sidebar.tsx`, `app/(app)/layout.tsx`, new `app/(app)/shell.css` (or reuse). Workspace switcher (mark+name+plan, menu w/ "Workspace settings" + "Multiple stores on one account — coming soon"), grouped nav (main: Overview·Studio·Generations·Products·Analytics; Configure: Script & install·Widget settings·Credits & billing·Settings) w/ active highlight + count badges, credit pill (balance, % used, meter, ok/warn/danger), account row. Keep `NAV_ITEMS` labels (nav.test). Responsive: fixed >1024, hidden (drawer) ≤1024. Verify; commit `feat(dashboard): YuzuView sidebar`.
- [ ] **Task 2.2 — Shell: Topbar + drawer.** Files: `components/shell/{Topbar,EnvToggle,ThemeToggle,NotificationsBell}.tsx`, shell css. Hamburger→off-canvas drawer + scrim ≤1024 (closes on nav), screen title, env toggle (Live active / Test locked → explainer dialog, rebrand copy), theme toggle (light/dark), notifications bell + dropdown, account menu (Account settings · Credits & billing · Sign out). Commit `feat(dashboard): YuzuView topbar + responsive drawer`.
- [ ] **Task 2.3 — Auth/login.** Files: `app/login/page.tsx`, `login.css`. BrandWordmark (YuzuView), subtitle "Sign in to your merchant dashboard.", email+password, Sign in / Create account, "or" divider, Continue with Google, inline error, space for forgot-password. Replace `auth-brand` "LUMINA" → YuzuView. Commit.
- [ ] **Task 2.4 — Overview.** Files: `app/(app)/overview/page.tsx` + `overview.css`, `components/overview/*`. Banner, KPI row (4 tiles: value+delta+sparkline), Generations-over-time timeseries (2 series+legend, empty "No activity in this period."), conversion funnel, top products, recent strip, empty "Analytics are warming up." Responsive KPI 4/2/1-up. Commit.
- [ ] **Task 2.5 — Onboarding.** Files: `app/(app)/onboarding/{OnboardingWizard.tsx,onboarding.css}`. Header "Get YuzuView live"/"You're all set" + progress (2/5), Up-next focus card, 5-step list (Account·Configure·Products·Install·Go live), completion + "Go to Overview". Rebrand string. Commit.
- [ ] **Task 2.6 — Studio overview + tabs.** Files: `app/(app)/studio/{StudioOverview,StudioTabs,StudioRenderGrid}.tsx`, `studio.css`, `studio/layout.tsx`. Hero + "New visualization" CTA, headline stats, recent renders grid (empty "No renders yet."), recent clients (empty "No clients yet."), sub-tabs Overview·New visualization·Clients. Commit.
- [ ] **Task 2.7 — Studio new visualization.** Files: `studio/new/NewVisualization.tsx`. compose→generating→result; client dropdown + "+ New client" inline form; product dropdown; room upload w/ preview "Choose another"; "Generate visualization"; generating hint "This usually takes 1–2 minutes."; result (before/after, coverage badge, Download · Email to client → "✓ Emailed" · View client · New render). Commit.
- [ ] **Task 2.8 — Studio clients + drawer + detail.** Files: `studio/clients/{ClientsView,ClientDrawer}.tsx`, `studio/clients/[id]/ClientDetail.tsx`. Toolbar (search + Add client), table (Client·Contact·Renders·Last activity·Edit/Delete w/ guarded confirm), empty states, add/edit drawer (Name·Email·Phone·Notes); client detail (back link, header, actions, notes, visualizations grid + load more). Commit.
- [ ] **Task 2.9 — Generations.** Files: `generations/{GenerationsGallery,GenerationDetailModal,BeforeAfter}.tsx`, `generations.css`. Status filter chips, card grid (thumb/status fallback + badge + product + date), Load more, empty "No generations yet.", detail modal (before/after + metadata: Category·Model·Latency·Credits·Cost·Placement·Created·Error code·Page URL). Commit.
- [ ] **Task 2.10 — Products.** Files: `products/{ProductsManager,ProductDrawer,ImportModal}.tsx`, `products.css`. Toolbar (search·category filter·Import CSV·Add product), table (Product·Category·External ID·Added·Edit/Archive), empties, add/edit drawer (Name·Image URL+preview·Category·External ID·Dimensions W/H/D + cm|in), Import CSV modal (columns help, file chooser, N valid/N skipped, per-row errors, sample, Import N). Commit.
- [ ] **Task 2.11 — Analytics.** Files: `analytics/page.tsx`, `analytics.css`. Range selector 7/30/90d + resolved range, same KPI row, timeseries, funnel, top products, warming-up states. Commit.
- [ ] **Task 2.12 — Script & Install.** Files: `script/{PlatformPicker,InstallGuide,ScriptInstallView}.tsx`, `script.css`. Picker (intro "Choose where you're installing YuzuView…", Script card active + WP/Shopify/Woo/Wix/Squarespace "Coming soon"), guide (back, env+key badge, Step1 code block w/ key, Step2 placeholder snippet showing `data-lumina-product`, Step3 verify checklist). Rebrand copy; keep `data-lumina-*`/`window.Lumina` in snippets. Commit.
- [ ] **Task 2.13 — Widget Settings + live preview.** Files: `widget/{WidgetSettingsEditor,WidgetPreview,RealWidgetPreview}.tsx`, `widget.css`. Save/status bar (Unsaved/All changes saved, Discard/Save). Groups: Trigger button text; Theme (accent swatches+hex, appearance segmented Light/Dark/Auto, radius slider 0-24, font select — relabel "Geist (LUMINA default)" → "YuzuView default"); Locale & copy (default locale + string overrides); Result CTA (quick-fill presets Shopify/Woo/Wix/Generic, CTA label, link template tokens); Branding ("Show 'Powered by YuzuView'"). Live preview segmented Button·Modal·Result. Responsive: 2-col >1024, stacked ≤1024. Commit.
- [ ] **Task 2.14 — Credits & Billing.** Files: `billing/BillingView.tsx`, `billing.css`. Status notices, credit summary card (big number, N of M used·resets date, meter, Manage billing), plan cards (Free/Starter/Growth/Scale/Enterprise, Growth "Most popular" ribbon, context CTA), credit ledger table, low-credit warning. Commit.
- [ ] **Task 2.15 — Settings.** Files: `settings/{SettingsView,DomainsSection,KeysSection,NotificationPrefsSection}.tsx`, `settings.css`. Account (store name+Save, workspace, signed-in-as, plan+Manage), API keys (create row, table, reveal-once modal), Allowed domains (add/list/remove, empty warning), Notifications matrix (In-app/Email × Failed previews/Low credits/Payment problems + Save), Team (read-only + designed invite flow "Invites coming soon"), Danger zone (Cancel subscription, Delete account type-to-confirm). Commit.
- [ ] **Task 2.16 — not-found + shared modals/menus/toasts/skeletons.** Files: `app/not-found.tsx`, `components/ui/{EmptyState,Skeleton,Menu}.tsx`, `app/(app)/overlay.css`. Branded 404, ensure shared overlay/menu/toast/skeleton match the system. Commit.

**Phase 2 gate:** `pnpm lint && pnpm typecheck && pnpm test` green; spot-check breakpoints. Continue to Phase 3.

---

# PHASE 3 — Widget restyle + UI fixes + responsive

**Deliverable:** widget matches the Widget Flow prototype, English default, responsive bottom-sheet/dialog, instructions focus fixed + expanded, "Powered by YuzuView", bundle <45 KB. Prototype: `YuzuView - Widget Flow.dc.html` — THE FLOW(29) · UPLOAD & CAMERA(162) · ERRORS & LONG WAIT(185) · VARIANTS(208).

- [ ] **Task 3.1 — Widget styles + theme.** Files: `widget/src/ui/styles.css`, `widget/src/ui/theme.ts`. Port tokens (scoped to Shadow host) and component styles to the YuzuView look, keep theme mapping (accent/mode/radius/font). Verify build + bundle size. Commit `style(widget): YuzuView styles + theme`.
- [ ] **Task 3.2 — Modal shell + launcher.** Files: `ui/Modal.tsx`, `core/launcher.ts`. Bottom-sheet <640 / centered dialog ≥640, ~92vh scroll, Close (×), "Powered by YuzuView" footer (toggle per plan), widen on Result. Launcher default themed button. Commit.
- [ ] **Task 3.3 — Upload step + camera.** Files: `ui/steps/UploadStep.tsx`. Title "Add a photo of your room", dropzone "Drag a photo here, or browse files", Use camera (+ viewfinder/Take photo/Close/denied), hint "JPG, PNG or WebP · up to {max}", inline reject error. Commit.
- [ ] **Task 3.4 — Confirm step (+ focus fix, TDD).** Files: `ui/steps/ConfirmStep.tsx`, `test/steps.test.ts`. Title "Place {product}", room preview, "Where should it go?" + placement chips (Auto·On the floor·On the wall·On a table·In the corner, single-select), instructions field **expanded by default**, placeholder "e.g. place it near the window, facing the room", ≤280, **focus-stable** (write a failing test asserting the textarea keeps focus / value across re-render, then fix the re-mount/key cause), "Generate preview" (no double-submit). Commit.
- [ ] **Task 3.5 — Generating step.** Files: `ui/steps/GeneratingStep.tsx`. Dimmed room bg, progress + rotating stage hints (Checking your photo… / Isolating the product… / Understanding your room… / Placing the product… / Final checks… / Almost there…), title "Creating your preview…", subtitle "This usually takes 1–2 minutes.", graceful long-wait. Commit.
- [ ] **Task 3.6 — Result step.** Files: `ui/steps/ResultStep.tsx`, `ui/BeforeAfter.tsx`. Before/after draggable slider (hero), feedback 👍/👎 → "Thanks for the feedback!", actions Save/Share/Try again, coverage block (AI estimate ~{qty}, stepper, note) for coverage products only, result CTA (merchant label) that performs the configured action with chosen quantity + emits `cta:click`. Commit.
- [ ] **Task 3.7 — Error states + inline variant.** Files: `ui/steps/ErrorState.tsx`, `ui/App.tsx`. Three friendly kinds (bad image / failed / out of credits) + Try again; inline/embedded variant container. Commit.
- [ ] **Task 3.8 — i18n English default + poweredBy rebrand (TDD).** Files: `core/i18n.ts`, `test/i18n.test.ts`. Failing test: default locale resolves to English when no lang declared; then ensure resolution order. Change `poweredBy` to "Powered by YuzuView" / localized equivalents (keep localized phrasing, swap brand). Commit.

**Phase 3 gate:** `pnpm -F @lumina/widget test`, `pnpm -F @lumina/widget test:e2e`, bundle-size check, `pnpm lint && pnpm typecheck`. Continue to Phase 4.

---

# PHASE 4 — Cleanup, final rebrand sweep, push

- [ ] **Task 4.1 — Dead-code sweep.** Remove any per-route CSS rules/classes no longer referenced, unused components, orphaned imports. Verify build + tests.
- [ ] **Task 4.2 — Brand string sweep.** `grep -rni "lumina"` across `apps/dashboard/src`, `apps/widget/src`, `apps/api/src/lib/email` and `lib/generations/email.ts`; convert every **user-facing** occurrence to YuzuView (incl. widget i18n ×5 `poweredBy`, email brand text), leaving code identifiers. Verify nothing user-facing says "LUMINA".
- [ ] **Task 4.3 — docs/design tidy.** Ensure old v1 design files are removed/relocated as intended; stage deletions.
- [ ] **Task 4.4 — Final gates + push.** `pnpm lint && pnpm typecheck && pnpm test` + widget `test:e2e` + bundle-size. Commit. Merge `redesign/yuzuview-ui` → `master` and push.

---

## Self-Review

- **Spec coverage:** §4 design language → Tasks 1.1-1.4. §5 Phase 1 → Phase 1; dashboard screens (B2-B14) → Tasks 2.1-2.16; widget (A2-A6) → Tasks 3.1-3.8; cleanup/rebrand/push → Phase 4. Email brand (§2) → Task 4.2. Responsiveness (§5) → built into each task + gates. UI fixes (§3) → Tasks 3.4 (focus, expanded), 3.8 (English default), 3.6 (feedback confirm preserved, CTA action).
- **Placeholder scan:** logic tasks (3.4, 3.8) specify the failing test intent; visual tasks reference the exact prototype section + copy strings — acceptable for a visual reimplementation where the prototype is the content.
- **Type consistency:** component class names defined in Task 1.2 are the vocabulary reused by Phase 2 tasks; `NAV_ITEMS` labels preserved for nav.test; widget public contract names unchanged.

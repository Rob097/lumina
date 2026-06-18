# YuzuView UI/UX Refactor — Design Spec

**Date:** 2026-06-18
**Status:** Approved — autonomous execution across 4 phases, push to `master` at the end.
**Scope owner:** dellantonio47@gmail.com

## 1. Goal

Refactor the **dashboard** (`apps/dashboard`) and **widget** (`apps/widget`) UI/UX to the new
**YuzuView** visual language defined in `docs/design/v2`, while **leaving all back-end logic and AI
flows untouched**. Keep the codebase clean (remove dead CSS/components). All dashboard copy is
English; the widget defaults to English (other locales kept, merchant-selectable). Both surfaces
must be **100% responsive** (desktop, tablet, small phones).

Source of truth for visuals: the `.dc.html` prototypes in `docs/design/v2/project/`
(`YuzuView - Foundations & Signatures.dc.html`, `YuzuView - Dashboard.dc.html`,
`YuzuView - Widget Flow.dc.html`, `Sidebar.dc.html`). Source of truth for content/behaviour:
`docs/design/v2/project/uploads/redesign-content-spec.md` and the existing codebase.

## 2. Decisions (locked)

- **Rebrand LUMINA → YuzuView, user-facing only.** Every visible brand reference reads "YuzuView"
  (auth wordmark, page titles/metadata, "Powered by YuzuView", onboarding "Get YuzuView live",
  EnvToggle copy, PlatformPicker/InstallGuide copy, widget i18n `poweredBy` in all 5 locales,
  transactional email brand strings in `apps/api`). **Code-level identifiers stay `lumina`**:
  `window.Lumina`, `data-lumina-*`, `@lumina/*` packages, `lumina-*` CSS classes, `LuminaController`,
  `lumina:<event>` events, file paths.
- **Email brand strings only.** In `apps/api` change only the brand text inside transactional email
  templates — no send logic, no routes, no data flow.
- **Keep the existing CSS architecture.** Vanilla CSS + CSS custom properties; per-route `*.css` in
  the dashboard; `packages/ui/styles/{tokens,components,app,index}.css` for shared layers; widget
  `src/ui/styles.css` + `theme.ts` inside Shadow DOM. **No new framework (no Tailwind).**
- **4 phases, autonomous.** Commit (Conventional Commits) between phases without a review pause;
  push to `master` after Phase 4.

## 3. Out of scope (must NOT change)

- Any DB query, RLS policy, Drizzle schema/migration, R2 key scheme.
- `AIOrchestrator`, Inngest workflows, fal/Replicate calls, `packages/ai`.
- API routes / request handling in `apps/api` (except email brand text strings).
- `actions.ts` server logic except where a string is pure user-facing copy.
- The widget's public contract: `window.Lumina`, emitted `lumina:*` events, `data-lumina-*` attrs,
  presigned-upload / generationId flow.

UI-layer defects explicitly in scope (they live in the rendering layer, not back end):
widget default-locale must be English; the custom-instructions field must be expanded by default and
must not lose focus while typing; keep the "Thanks for the feedback!" confirmation.

## 4. Design language (from Foundations)

- **Type:** Hanken Grotesk (UI) + JetBrains Mono (data/code). Dashboard loads them via `next/font`.
  Widget keeps a lean default (system-stack fallback close to Hanken Grotesk; optional web-font only
  if the <45 KB gzip budget allows — finalized in Phase 3).
- **Palette (light):** `--brand:#5A55D6` (Yuzu Indigo), `--brand-600:#4D45C2`, `--brand-700:#3F39A8`,
  `--brand-300:#9C95EE`, `--brand-100:#ECEAFB`, `--brand-50:#F5F3FE`, `--fruit:#8B82EC`,
  `--plum:#7A3A66`; ink `#181621`/`#45424F`, muted `#76727F`, faint `#A9A5B5`, line `#E7E5EE`/`#F0EFF5`,
  surface `#FFFFFF`/`#F8F8FB`, canvas `#EAE9F0`; success `#1E8E5A`(+`#E3F3EB`), warning `#B97309`
  (+`#FAF0DA`), danger `#D2453E`(+`#FBE7E6`).
- **Palette (dark):** canvas `#100E17`, surface `#1A1822`, surface-2 `#221F2D`, brand `#8E86F2`.
- **Spacing** 4px base; **radius** 8/12/16/22; **elevation** e1/e2/e3 as defined in the Foundations
  file. Reduced-motion respected.
- **Component vocabulary** (build once, reuse): buttons (primary/secondary/ghost/danger/small,
  disabled+loading), inputs (text/textarea+counter/select/color/range/file-dropzone/toggle/checkbox),
  segmented control, chips (placement + status/filter), badges (neutral/accent/success/warning/
  danger/live/test), cards + KPI tiles (value+delta+sparkline), meters (ok/warn/danger), tables w/
  row actions (horizontal scroll on small screens), side drawers, modals (import/reveal-key/
  delete-confirm/env-explainer/generation-detail), charts (timeseries multi-series+legend, funnel,
  sparklines), before/after slider (signature), code block w/ copy, plan card ("Most popular" ribbon),
  empty states, skeletons, menus/dropdowns, toasts/notices, avatars (initials).

## 5. Phase plan

### Phase 1 — Design system foundation
- Rewrite `packages/ui/styles/tokens.css` (light + dark tokens, fonts, spacing/radius/elevation).
- Rewrite `packages/ui/styles/components.css` + `app.css` to the YuzuView component vocabulary;
  keep `index.css` aggregation and the `@lumina/ui` import contract intact.
- Add Hanken Grotesk + JetBrains Mono to the dashboard (`next/font`), wire into `app/layout.tsx`.
- Copy `yuzuview-logo.png` + `yuzuview-mark.png` into `apps/dashboard/public/` (and widget assets if
  needed). Provide an SVG/inline mark for the sidebar/auth wordmark.
- **DoD:** `pnpm lint` + `pnpm typecheck` clean; existing unit tests (incl. `nav.test`) green.

### Phase 2 — Dashboard
- Shell: `Sidebar` (workspace switcher, grouped nav, credit pill w/ urgency, account row),
  `Topbar` (hamburger→drawer, env toggle, theme toggle, notifications bell, account menu), off-canvas
  drawer + scrim ≤1024 closing on navigation.
- Restyle every screen to YuzuView with English copy: auth/login, onboarding, overview, studio
  (overview / new visualization / clients / client detail), generations (+ detail modal), products
  (+ drawer + import modal), analytics, script & install (picker + guide), widget settings (+ live
  preview), credits & billing, settings (account/api keys/domains/notifications/team/danger),
  not-found, shared modals/menus/toasts/skeletons/empty states.
- Responsiveness: `>1024` fixed sidebar, KPI 4-up, editor 2-col · `≤1024` drawer, KPI 2-up, widget
  settings stacked, wide tables scroll-x · `≤560` KPI 1-up, multi-field rows wrap. Every table,
  drawer, modal usable on a phone.
- Rebrand user-facing strings → YuzuView. Remove old per-route CSS/markup as each screen is migrated.
- Dark mode implemented from dark tokens (theme toggle already exists).
- **DoD:** lint/typecheck clean; unit tests green; manual responsive check at the three breakpoints;
  Conventional Commit.

### Phase 3 — Widget
- Restyle all steps/states to YuzuView: launcher (default+themed), upload (idle/drag/error), camera
  (viewfinder/denied), confirm (placement chips + instructions), generating (stage hints + long-wait),
  result (before/after + feedback + actions + coverage stepper + CTA), error kinds (bad image / failed
  / out of credits), powered-by footer, inline/embedded variant.
- Responsiveness: bottom-sheet `<640`, centered dialog `≥640`, content scroll within ~92vh.
- UI fixes: default locale English; instructions field expanded by default and focus-stable while
  typing; preserve feedback confirmation; "Powered by YuzuView".
- Constraints: Shadow DOM only; **bundle <45 KB gzip**; `window.Lumina` and emitted events unchanged.
- **DoD:** lint/typecheck clean; unit tests + Playwright E2E green; `check-bundle-size` passes;
  Conventional Commit.

### Phase 4 — Cleanup, final rebrand sweep, push
- Delete dead CSS/components left after migration; tidy `docs/design` (v1 `.html` already deleted in
  git working tree — stage the deletions).
- `grep` sweep for residual user-facing "LUMINA"/"Lumina" (dashboard, widget i18n ×5 locales, email
  brand strings in `apps/api`) — convert to YuzuView, leaving code identifiers.
- Final gates: `pnpm lint && pnpm typecheck && pnpm test`, widget bundle-size, widget E2E.
- Commit, then **push to `master`**.

## 6. Testing strategy

- Existing tests are logic/contract tests (format, nav, slider, csv, overview, platforms, widget
  config/state/steps, etc.) and must stay green — the refactor changes markup/CSS, not logic.
- TDD applies where behaviour changes: e.g. the widget instructions focus-stability fix and the
  English-default locale resolution get a failing test first, then the fix.
- Widget E2E (Playwright) must continue to pass through the restyle.
- Visual fidelity is verified against the `.dc.html` prototypes per screen; no screenshot tests added.

## 7. Risks / notes

- **Widget font weight** vs the 45 KB budget — resolve in Phase 3 (system-stack default preferred).
- **Dashboard dark mode** parity across all screens — dark tokens must cover every surface used.
- `nav.test.ts` asserts `NAV_ITEMS` labels — keep them English/stable.
- Keep `packages/ui` import surface (`@lumina/ui`, `styles/index.css`) stable so consumers don't break.

# @lumina/widget

The embeddable **"Try in your room"** widget — Preact + Vite, rendered entirely inside a **Shadow DOM**,
shipped as a 2-file loader. A merchant pastes one `<script>` line; shoppers upload a room photo and the AI
pipeline composites the product into it.

## Install (what a merchant pastes)

```html
<script async src="https://cdn.lumina.app/widget.js" data-site-key="pk_live_…"></script>

<!-- Declarative: any element becomes a launcher -->
<button data-lumina-trigger data-lumina-product="SKU-1234">Try in your room</button>
```

`widget.js` is the **immutable loader** (~2 KB): it reads `data-*`, creates the `window.Lumina` command
queue, and injects the **content-hashed** app bundle (`widget.[hash].js`, **< 45 KB gzipped**). Deploys are
instant and safe — the merchant never edits their HTML again.

## Two-stage build (D22)

```bash
pnpm -F @lumina/widget build   # node build.mjs: app (hashed) -> loader -> bundle-size gate
pnpm -F @lumina/widget size    # gzip the app bundle, fail if > 45 KB (HARD RULE #7)
pnpm -F @lumina/widget dev      # vite dev server (index.html harness)
pnpm -F @lumina/widget test     # vitest (happy-dom) unit suite
pnpm -F @lumina/widget test:e2e # playwright acceptance (builds + mock API + test-store.html)
```

Build-time config (never secrets — the widget only sees a `site_key`, presigned URLs, a `generationId`):
`PUBLIC_API_URL`, `PUBLIC_CDN_URL`, `PUBLIC_SENTRY_DSN` (see `.env.example`).

## Public API (§3.4)

| Method | Signature | Notes |
|---|---|---|
| `Lumina.init` | `init(config)` | Boots, fetches remote config, binds triggers. Idempotent. |
| `Lumina.open` | `open(opts): Promise<void>` | Open for a `productId` or an inline `product`. |
| `Lumina.close` | `close()` | Close the modal. |
| `Lumina.configure` | `configure(partial)` | Runtime theme/locale/text. |
| `Lumina.on` / `off` | `on(event, handler) → unsub` | Subscribe / unsubscribe. |
| `Lumina.preload` | `preload()` | Warm bundle + remote config. |
| `Lumina.version` | `string` | Loaded bundle version. |

Programmatic install:

```html
<script async src="https://cdn.lumina.app/widget.js"></script>
<script>
  window.Lumina = window.Lumina || { q: [] };
  Lumina.init({ siteKey: 'pk_live_…', locale: 'it', theme: { accent: '#0F62FE' } });
  document.querySelector('#try').addEventListener('click', () =>
    Lumina.open({ product: { name: 'Aura', imageUrl: 'https://…/aura.png', category: 'lighting' } }),
  );
</script>
```

## Events (§3.6)

Delivered via `Lumina.on(event, handler)` **and** as `window` CustomEvents (`lumina:<event>`), so GTM /
analytics can listen on the DOM:

`ready` · `open` · `close` · `upload:start` · `upload:done` · `generate:start` · `generate:progress` ·
`generate:success` · `generate:error` · `result:save` · `result:share` · `feedback` · `cta:click`.

`cta:click`, `generate:success` and `feedback` are the conversion/ROI signals merchants wire to analytics.

## Flow

`config` → `sign-upload` → **direct PUT to R2** → `generate` → poll `/widget/status/:id` (D21: polling is
the in-bundle transport; a Supabase Realtime transport can be lazy-loaded later without bloating the
bundle). Room photos are downscaled (≤ 2048px), EXIF-oriented, and re-encoded client-side (WebP→JPEG),
which also strips EXIF/GPS (HARD RULE #9; the server strips again).

On the **confirm** step the shopper picks a placement chip (auto/floor/wall/table/corner → `placementHint`)
and may expand an optional **custom-instructions** field (`customInstructions`, ≤ 280 chars). Both ride the
`generate` request and reach `AIOrchestrator.compose`; the prompt renders the free text as a *soft
preference* below the HARD RULES so it can't override product identity, room integrity, scale, or framing.

## Architecture

Framework-agnostic, injectable core in `src/core` (config, API client, `LuminaController` state machine,
status, i18n, image pipeline) is unit-tested under happy-dom; a thin Preact view in `src/ui` (Shadow-DOM
mount, focus-trapped modal, step components, before/after slider) only renders controller state. The full
path is covered by `e2e/widget.spec.ts` against `e2e/mock-api.mjs` + `test-store.html`.

## CSP directives (strict-CSP merchants, §3.9)

```
script-src  https://cdn.lumina.app ;
connect-src https://api.lumina.app https://<r2-bucket-host> ;
img-src     https://<r2-bucket-host> blob: data: ;
```

# Generation Engine v2 — what changed, and an honest account of how we got here

> **Scope.** This document compares the generation pipeline as it stands at commit `ac16e42` (2026-06-17)
> against the code **before** `04cdb41f28736444600cc36fb1014fe5b8667e63` (2026-06-16) — i.e. the pipeline
> as it was *before* the "Generation Engine v2" work began. `04cdb41` itself only added docs/plan; the
> code at that point was still the original single-shot pipeline (D62).
>
> **Status: not good.** The current output is still unsatisfactory. This is a status/decision record, not a
> success report. Read the "Honest assessment" section before assuming any of this improved quality.

---

## 1. What the pipeline did BEFORE (baseline, pre-`04cdb41`)

A single generative pass, from scratch, on the raw inputs:

```
load generation → strip EXIF → moderate input
   → compose: ONE generateText call (room + product) at 2K, aspect-ratio pinned   (D62)
   → pixel-perfect composite (diff-mask blend over the original room)
   → moderate output → store → finalize
```

- No product background removal, no scene understanding, no room straightening.
- A coverage **quantity** estimate already existed (#7, shipped earlier for the widget stepper) but was
  **not** shown in the merchant dashboard.
- Coverage products (panels, tiles, decking) were composed exactly like any other product — the model
  placed the product itself.

## 2. What the pipeline does NOW (`ac16e42`)

The image is **still produced by one from-scratch generative compose** (same fundamental approach as the
baseline). What changed around it:

**Added, active:**
- **Product cutout (Phase 1).** Before compose the product is background-removed and cached per product
  (`products.clean_image_key`). The shipped implementation is a **generative Gemini cutout via the AI
  Gateway**, *not* the matting model the plan recommended — the plan explicitly flagged that a generative
  cutout re-renders the product pixels and can alter identity/branding. (`bg-removal*.ts`)
- **Scene analysis (Phase 2).** A cheap `gemini-2.5-flash` pass returns per-image facts (lighting, surfaces,
  tilt, scale, suggested placement) that are fed into the compose prompt. Best-effort. (`scene.ts`,
  `gateway-scene.ts`)
- **Room normalization (Phase 3).** Deskew (clamped) + conditional auto-level with `sharp` before compose;
  the normalized room becomes the baseline for the aspect pin and the pixel-perfect blend. (`normalize.ts`)
- **EXIF auto-orient at ingest.** Orientation is now baked into the pixels (portrait photos are no longer
  rotated 90°) — added mid-firefight. (`orient.ts`)
- **Coverage quantity in the dashboard.** The estimate is stored on the generation and now surfaced in the
  Studio result as a callout ("≈ N pcs to cover the surface" + rationale). `GenerationDetail` carries
  `suggestedQuantity` / `quantityRationale`. **This is the only genuinely new user-facing behavior.**
- **Infra/correctness fixes** that the above depend on: `sharp` actually loads on the Vercel Inngest
  function now (libvips native lib tracing — see §4); the Inngest route timeout was raised 60s → 300s; the
  scene-analysis response schema was fixed (a `z.tuple` that Gemini's structured output rejected).
  `GET /internal/sharp-check` exists to verify `sharp` on Vercel without running a billed generation.

**Built, then abandoned — now dormant code in the tree (NOT used at runtime):**
- The whole **coverage layout-guided path**: `images/layout.ts` (tile the product across a surface),
  `prompts/refine.ts` (REFINE prompt), `ComposeInput.layout`, the gateway `[layout, product]` branch, and
  the refine switch in `prompt.ts`. After several iterations (see §4) the decision was to **not** put N
  product copies in the image at all. This code is left in place, unused.

**Deferred / never done:**
- **Phase 4 (routing & speed)** was never executed — it was gated on an eval baseline that was never run.
  There is still no measured quality or latency comparison; the common path has not moved to a fast model.

### Net effect on the actual result

For the generated **image**, coverage products are back to where they were before `04cdb41`: a single
from-scratch AI compose. The surrounding additions (cutout, scene facts, normalization, auto-orient) feed
that compose cleaner inputs, but **there is no evidence (no eval run) that they improved output quality**,
and the current result is still reported as bad. The one concrete, verifiable change a merchant sees is the
**quantity number in the dashboard**. The rest is added internal complexity and a large amount of dormant
code.

---

## 3. Honest assessment / open issues

- **Quality is unverified and currently unsatisfactory.** No eval-harness run backs any quality claim. The
  Phase 0 baseline + Phase 4 routing the plan required were skipped.
- **Significant dead code / tech-debt.** `layout.ts`, `refine.ts`, `ComposeInput.layout`, and the gateway
  refine branch are dormant. They should either be removed or revived deliberately, not left ambiguous.
- **The cutout is generative, not matting.** Against the plan's own fidelity recommendation; it can subtly
  alter the product. Not A/B-tested.
- **A lot of the effort went into firefighting**, not product value (see §4) — most of the 21 commits in
  this range are fixes to make `sharp` load on Vercel and to walk the coverage feature forward and back.
- **Coverage UX is a compromise.** The image is now only *illustrative* for coverage products; the "how
  many you need" lives in a separate dashboard callout. Whether that reads clearly to merchants is untested.

---

## 4. How we got here — the steps and attempts (chronological)

The work after `04cdb41`, in order. Several of these are dead-ends or reversals.

**Planned v2 build (Phases 0–3):**
1. `af35098` — eval harness by input class + expanded golden set (Phase 0 scaffolding; the baseline was
   never actually captured/used as a gate).
2. `7f891b0` → `7677eca` — product cutout via **Replicate** matting, cached per product (Phase 1).
3. `8663e91` — **reversal:** dropped Replicate, switched the cutout to a **generative Gateway/Gemini** cutout
   ("no new vendor") — trading the fidelity the matting approach was chosen for.
4. `59d0a8d` — scene-analysis pass feeding compose (Phase 2).
5. `b36fc8a` — room normalization (deskew + auto-level) (Phase 3).

**First real production run surfaced multiple breakages:**
6. `25eee7a` — three independent prod failures at once: scene schema (`z.tuple` rejected by Gemini), `sharp`
   bundling, and a 60s Inngest timeout. Partial fixes (the `sharp` part turned out **insufficient**).
7. `e568626` — bake EXIF orientation at ingest (portrait rooms were coming out rotated 90°).

**Coverage feature (Phase 5) — built, then repeatedly reworked:**
8. `e6d3011`, `547fe49`, `9937913`, `9987e7c` — build the layout guide + REFINE compose + wire it in.
9. `c0d2bb6` — attempt #2 at `sharp` on Vercel (trace the libvips `.so`). **Also insufficient at runtime.**
10. `5ec94fc`, `f6538e5` — coverage tiling tweaks (fallback to raw product; gate on category not the flaky
    estimate; start storing result dimensions). Results were still wrong because `sharp` was silently dead.
11. `c24ba4c` — **reversal #1:** "retire the REFINE pass, ship the deterministic tiled composite." Decided
    on a false premise — `sharp` was still not loading, so REFINE had never actually been fed a real guide.
12. `6d8f605`, `9c96652` — **the actual root cause fix:** `sharp` failed on the Inngest function with
    `ERR_DLOPEN_FAILED: libvips-cpp.so` (a pnpm file-tracing miss — the addon resolves libvips via a sibling
    symlink whose `.so` wasn't packaged at the RUNPATH path). Every `sharp` call was wrapped in try/catch, so
    this had been failing **silently** the whole time and was the real reason for "rotated room / single
    panel / null dimensions". This is the one fix that genuinely mattered.
13. `f1a1836` — chore: re-trigger a Vercel deploy the GitHub webhook had missed.
14. `123512b` — **reversal #2:** with `sharp` finally alive, re-enable the REFINE pass over the (now real)
    deterministic guide. The tiled-then-refined result was judged worse.
15. `ac16e42` — **reversal #3 (current):** stop tiling product copies into the image entirely. Coverage
    composes from scratch like any product; the quantity becomes informational and is shown in the
    dashboard. Removed the tiling helpers from the workflow; left the modules dormant.

**Summary of the arc:** a planned input-cleaning effort (Phases 1–3) collided with a `sharp`-on-Vercel
infrastructure bug that stayed invisible for many commits, during which the coverage feature was pushed
forward and rolled back three times. The infra bug is fixed; the coverage feature landed essentially back at
the baseline behavior plus a dashboard number; quality remains unproven and currently poor.

---

## 5. What is deployed

`master` @ `ac16e42`. Coverage = from-scratch AI compose + quantity in the dashboard. `sharp` loads on the
Inngest function. Phase 4 (speed/routing) and a real eval-based quality gate are still outstanding.

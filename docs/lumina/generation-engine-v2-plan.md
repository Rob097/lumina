# LUMINA — Generation Engine v2: Robustness & Speed Plan

> **Audience:** Claude Code (implementation agent) + the LUMINA lead engineer.
> **Goal of this document:** turn the strategic analysis below into a phased, test-first
> implementation plan that makes the core compose pipeline robust to non-standard inputs and
> meaningfully faster, **without** introducing a category/position taxonomy and while staying on the
> services LUMINA already uses.
>
> **How to use this plan:** execute phases in order. Each phase is independently shippable and gated by
> the eval harness (see *Testing philosophy*). **Do not start Phase 4 (speed/routing) until Phases 1–3
> have been validated by the eval harness** — switching to the fast model before inputs are clean trades
> quality for speed. Respect every hard rule in `CLAUDE.md`. Commit only when the owner asks; branch off
> `master` first; end commit messages with the repo's `Co-Authored-By` trailer; record each non-obvious
> decision in `docs/DECISIONS.md` (the entries are drafted below, ready to paste).

---

## Preface — Analysis (the diagnosis)

### Why the engine is fragile today

The fragility is **architectural, not a prompt or model problem.** The pipeline asks a single model, in
a single pass, to perform an open-ended, hard task from noisy inputs. In one `generateText` call, Gemini
must understand the room geometry, understand the product, decide placement, estimate real-world scale,
align perspective, reconstruct lighting and contact shadows, **and** preserve the exact product identity.
When the room is straight and the product is a studio shot, it succeeds. The moment an input leaves the
standard envelope (tilted photo, ambiguous framing, poorly-shot product), the model degrades on *all of
these axes at once* — which is why the result is not "slightly worse" but completely wrong. The more
degrees of freedom the model is given, the more failure points exist.

### The second, subtler failure: the pixel-perfect composite degrades silently

The pixel-perfect composite (D62) assumes the edited frame is **aligned** with the original except where
the product was added. But the image model re-renders the entire frame, and on hard inputs it tends to
"correct" the framing — straighten, rotate, re-crop. When that happens, `shouldComposite` sees a large
`changedFraction` and, by design, **falls back to the full render** — i.e. exactly the re-framed,
distorted frame. (Below the threshold, it blends a slightly misaligned frame over the original, producing
ghosting.) In other words, the realism guarantee **turns itself off precisely in the cases where it is
needed most.** This is consistent with the "extremely distorted output on crooked rooms" symptom.

### The guiding principle: robustness and speed are the same project

The lever for both is identical: **stop asking the model to build everything from scratch on raw inputs.**
Two moves —

1. **Normalize and clean the inputs** so the model always sees something close to the easy case.
2. **Constrain the task** from "construct the whole composite" to "refine a known layout."

Both reduce the model's degrees of freedom → higher reliability → and let us drop to the **fast** model →
lower latency. Crucially, none of this needs categories. We add a thin **per-image understanding** layer
(continuous facts about *that specific photo* — light direction, surface map, tilt, scale), which is the
opposite of a discrete category/position taxonomy and stays scalable to any environment.

---

## 1. Objective & success metrics

**Primary objectives**

- **Robustness:** acceptable composites on non-standard inputs — tilted rooms, ambiguous framing,
  dark/blurry photos, exteriors, and **non-studio product photos** — not just "living room + chandelier".
- **Speed:** cut median generation latency well below the current ~60s.
- **No taxonomy:** keep the category-agnostic design (the model infers the placement archetype; we add
  per-image facts, never a category switch).
- **Minimize new vendors:** implement on the existing stack (sharp, Vercel AI Gateway, Inngest, R2,
  Upstash). The only candidate already inside the perimeter is **Replicate** (MCP-connected; a
  `replicate.ts` provider stub already exists) — see Phase 1.

**Success metrics (validate the targets against real model latency in Phase 0; these are goals, not
promises):**

- Quality: eval-harness 👍 rate on the **expanded** golden set (incl. non-standard inputs) materially
  above the Phase 0 baseline, with **no regression** on the standard cases that already work.
- Latency (common/fast path): target **p50 < 15s, p95 < 30s**; quality path may run longer.
- Fidelity invariant: product geometry/materials/colors/branding preserved (hard rule), measured on the
  golden set.
- Cost: per-generation `cost_cents` tracked in Axiom does not regress materially (the extra cheap
  vision/cutout passes are offset by defaulting to the fast composite model and by cutout caching).

---

## 2. Non-goals

- **No** category/position taxonomy or per-category prompt switches. (Already the right call — keep it.)
- **No** swapping to a "bigger" model hoping it fixes noise. The pro model is not more robust to tilt; it
  is only slower.
- **No** new third-party vendors beyond possibly Replicate (already MCP-connected, stub present). No `fal`
  reintroduction.
- **No** widget changes that risk the < 45 KB gz bundle budget — all of this work is **server-side**
  (`packages/ai`, `apps/api/src/lib/inngest`, `apps/api/src/lib/images`). The widget is untouched except,
  optionally, copy for new progress stages.

---

## 3. Hard constraints to respect (from `CLAUDE.md`)

- **AI provider abstraction (#8):** every model call goes through `AIOrchestrator`. New capabilities
  (background removal, scene analysis) are added as **new provider seams** mirroring `AIProvider`, wired
  in `packages/ai/src/factory.ts`. **No provider SDK calls in handlers or the workflow** — the workflow
  calls orchestrator methods only.
- **Prompts surface (#8):** all prompt text lives in `packages/ai/src/prompts/`. New prompts (`scene.ts`,
  a refine variant) go there; never scatter prompt strings in handlers.
- **Validation & errors (#5/#6):** every new input/output is a **Zod** schema in `packages/shared`; strict
  TS, no `any` (use `unknown` + Zod). Public endpoints keep the `{ error: { code, message, requestId } }`
  envelope.
- **Money & credits (#3):** do not change the atomic debit / refund-on-failure / idempotent-refund
  invariants. Any new pre-pass that can fail must **refund and fail terminally** if it is required, or be
  **best-effort** (never bill a failed generation). Cutout/scene/normalize failures must degrade
  gracefully, not silently bill.
- **Migrations only via Drizzle (#4):** if a schema change is needed, generate the next migration
  (`drizzle-kit generate` → `migrate`). The Supabase MCP stays read-only.
- **Tenant isolation (#1) & privacy (#9):** new R2 objects (cutouts, intermediates) keep the
  `{merchant_id}/` prefix. EXIF/GPS stripping stays. Cutouts derived from product images inherit tenant
  scoping.
- **TDD + DoD:** tests written first (red → green → refactor); lint + typecheck clean; Conventional
  Commits; docs/DECISIONS updated; commit only when asked.

---

## 4. Target pipeline shape (after Phase 5)

```
load generation → flip to "processing"
   ├─ (parallel) sanitize + normalize room  → canonical room  (Phase 3)
   ├─ (parallel) ensure product cutout (cached per product)    (Phase 1)
   └─ (parallel) scene analysis (cheap flash vision → JSON)     (Phase 2)
            ↓ join
   moderate input
            ↓
   build rough layout composite (cutout + scene placement + dims)   (Phase 5)
            ↓
   compose — REFINE mode; fast model by default, escalate on difficulty  (Phase 4)
            ↓
   pixel-perfect composite (diff-mask + blend over the NORMALIZED room)
            ↓
   moderate output → store result → coverage-quantity (best-effort) → finalize
```

Key behavioral notes:

- The pixel-perfect composite now blends over the **normalized** room, so the returned image may be gently
  deskewed relative to the raw upload (intended — see Phase 3 / D65).
- Phase 5 localizes the model's changes to the product region, which makes the diff-mask clean and the
  pixel-perfect composite reliable even on hard inputs — this is what finally dissolves the "silent
  degradation" failure from the preface.

---

## 5. Testing philosophy (read before writing any test)

Generative image output cannot be asserted pixel-exact. Split testing into two layers:

1. **Deterministic unit/integration tests — written red-first (the real TDD loop).** Everything around the
   model is deterministic and must be unit-tested with injectable runners (exactly like the existing
   `gateway.ts` test that injects the network call):
   - New provider seams: input ordering, image-part assembly, output extraction, error/fallback handling.
   - Zod schemas (scene analysis, cutout result) + parse round-trips.
   - Prompt assembly: scene facts / dimensions / placement appear in the built prompt; refine-mode prompt
     selected when a rough composite is present.
   - `packages/ai/src/factory.ts` routing: policy/model selection per plan **and** per scene difficulty.
   - Image math (pure helpers, like the existing `computeTargetSize`/`parseExifOrientation`): deskew angle
     clamp, inscribed-rectangle crop, auto-level decision, layout paste transform (position/scale).
   - Cutout caching/idempotency: second generation for the same product does **not** call the removal
     provider.
   - **Invariants that must keep passing:** never bill a failed generation; refund idempotent across
     retries / `onFailure`; tenant scoping on new R2 keys; required-pass failures refund-and-fail.

2. **Eval harness — the quality regression gate (not a unit assertion).** Use `scoreEval` +
   `pnpm -F @lumina/api eval` over `apps/api/scripts/eval-golden.json`. **Phase 0 expands the golden set**
   with non-standard inputs and defines threshold-based pass/fail. Every later phase must beat (or at least
   not regress) the prior baseline on this set before it ships. Run mock offline; run against the real
   Gateway when keyed.

> Instruction to Claude Code: write the **deterministic** tests first and make them fail, then implement.
> Treat the **eval harness** as the gate between phases, not as a unit test. Report eval numbers honestly;
> never claim a quality improvement without an eval run.

---

## Phase 0 — Measurement & baseline (do this first)

**Objective:** establish a data-grounded baseline and a non-standard regression set, so every later change
is measured, not guessed. Also capture one low-risk early speed win if the data supports it.

- [ ] Confirm the latency split in **Axiom** (the workflow already emits cost/latency/model/status per
      generation): how much of the ~60s is the **pro model at 2K** vs pipeline overhead. Record p50/p95
      latency **by model**.
- [ ] **Expand `apps/api/scripts/eval-golden.json`** with non-standard cases, each with the input pair and
      an expected-acceptable note:
      - tilted / rotated room photos
      - ambiguous / tight framing
      - dark and low-contrast rooms
      - blurry / phone-snapshot rooms
      - **exterior** scenes (facade, entrance, garden)
      - **non-studio product photos** (cluttered background, hand-held, on-shelf)
      - at least one per coverage category (tiles/decor/renovation/outdoor) for the quantity path
- [ ] Extend `scoreEval` reporting to break down success/👍/latency/cost **by input class** (standard vs
      each non-standard class), not only by product category.
- [ ] Capture the **baseline** numbers (quality + latency + cost) and paste them at the top of the eval
      output / a short note in `docs/` for comparison.
- [ ] **Early speed win (only if Axiom confirms it):** today `balanced = [quality, fast]`, so starter/growth
      start on the **pro** model. If the data shows the standard cases pass on the **fast** model with no
      quality loss, land a minimal, reversible config change so the common path doesn't default to the
      slowest model on cases that already work. Keep the full routing rework for Phase 4.

**DoD:** baseline recorded; expanded golden set committed; by-class eval reporting works; (optional) early
routing tweak landed behind the eval gate.

---

## Phase 1 — Product background removal (cutout), cached per product

**Objective:** give the compositor a clean product reference even from a messy photo, fixing the
"non-studio product" failure class at the source. Compute **once per product**, cache it, so per-generation
latency cost is ~zero on repeats.

**Why a matting model, not a generative "remove background":** asking a generative model to isolate the
product re-renders the product pixels → risks altering geometry/branding, violating the fidelity hard rule.
A **matting/segmentation model** produces an alpha matte; we composite the **original product pixels**
through that matte → product pixels are byte-preserved. This is strictly safer for fidelity.

**Recommendation:** implement a `BackgroundRemovalProvider` seam (mirrors `AIProvider`) with a **Replicate
matting** implementation (BiRefNet/`rembg`-class model — already MCP-connected; `replicate.ts` stub
exists), plus a **Gateway/Gemini-edit** implementation behind the same seam as a fallback. Decide the
default by A/B on fidelity over ~15–20 real products (tracked as an open decision). Default lean:
Replicate matting for fidelity; keep it swappable per hard rule #8.

- [ ] Add `BackgroundRemovalProvider` interface in `packages/ai` and wire it in `factory.ts` (env-selected;
      `mock` returns the original image unchanged for offline tests).
- [ ] Implement the Replicate matting provider (alpha matte → composite original pixels via `sharp`, with
      a small matte erosion/feather to kill edge fringing). Network call is an **injectable runner** so
      input/output handling is unit-tested without hitting Replicate (mirror the `gateway.ts` test pattern).
- [ ] Implement the Gemini-edit provider behind the same seam (fallback / A/B).
- [ ] Add `AIOrchestrator.removeBackground(input)` (or expose via the provider seam consistently with
      `compose`/`estimateQuantity`).
- [ ] **Wire `products.clean_image_key`** (already in the schema — no migration needed):
      - Compute on product **create** and **bulk upsert** via a small Inngest function
        (e.g. `product.image.process`, tenant-scoped, R2 key `products/{merchant_id}/clean/...`).
      - **Guard in the generation workflow:** if `clean_image_key` is still null at compose time, compute
        and cache it lazily, then proceed (covers pre-existing products and inline products).
- [ ] Compose uses `clean_image_key` when present, else falls back to the raw `image_url`. Update the
      product snapshot/compose input plumbing accordingly (keep `ComposeInput` typed in `packages/shared`).
- [ ] Tests (red-first): provider input/output + fallback; matte→composite math; **cache/idempotency** (2nd
      gen for same product skips the provider); workflow still refunds correctly if a *required* cutout
      fails; mock provider keeps offline e2e green.

**Env (add to `.env.example`, names are the source of truth):** `REPLICATE_API_TOKEN`,
`BG_REMOVAL_PROVIDER` (e.g. `replicate` | `gateway` | `mock`), `BG_REMOVAL_MODEL`.

**Risk/rollback:** if cutout quality is poor for a product, the workflow falls back to the raw image — the
pre-Phase-1 behavior. The feature is gated by `clean_image_key` presence, so disabling is a config flip.

**DECISIONS.md (paste, English):**
```
D63 — Product background removal wired (cached per product).
Context: non-studio product photos produced distorted composites because the model had to infer the
product silhouette from a busy reference. Decision: add a BackgroundRemovalProvider seam (mirrors
AIProvider, swappable per the one-file rule). Default to a Replicate matting model (BiRefNet/rembg-class,
already MCP-connected; replicate.ts stub) and composite the ORIGINAL product pixels through the alpha
matte so product fidelity is byte-preserved (a generative "remove background" was rejected because it
re-renders the product and risks altering identity/branding). A Gemini-edit implementation exists behind
the same seam as a fallback. The cutout is stored in products.clean_image_key (schema already had the
column) and computed once per product (Inngest product.image.process) with a lazy compute-and-cache guard
in the generation workflow. Compose uses clean_image_key when present, else the raw image_url.
```

---

## Phase 2 — Scene analysis (cheap per-image vision pass)

**Objective:** give the compositor a head start so it no longer infers geometry from a noisy image. A single
cheap `gemini-2.5-flash` call (the model already used for quantity) returns **continuous, per-image facts**
— not categories. Feeds compose (lighting/scale/surfaces), Phase 3 (tilt), and Phase 4 (difficulty → model
escalation).

- [ ] Add `prompts/scene.ts` → `buildScenePrompt()` (in the prompts surface). `prompts/README.md` already
      lists `scene.ts` as "coming in later stages" — implement it.
- [ ] Add `SceneAnalysis` Zod schema in `packages/shared` (sketch — refine during impl):
```
SceneAnalysis = {
  isExterior: boolean,
  lighting: { direction: 'top'|'top-left'|'top-right'|'left'|'right'|'front'|'ambient'|'unknown',
              temperatureK?: number, intensity: 'low'|'medium'|'high' },
  surfaces: Array<{ kind: 'floor'|'wall'|'ceiling'|'table'|'ground'|'other', orientation?: string }>,
  tiltDegrees: number,                 // estimated horizon/vertical tilt, signed
  roomScale?: { ceilingHeightM?: number, referenceObjects?: string[] },
  suggestedPlacement?: { region: string, bbox?: [number,number,number,number] }, // 0..1 normalized
  quality: { blurry: boolean, dark: boolean, cluttered: boolean },
  confidence: number                   // 0..1
}
```
- [ ] Add `AIOrchestrator.analyzeScene(input)` (a `generateObject` Zod call on `GATEWAY_MODEL_QUANTITY`'s
      sibling / `gemini-2.5-flash`), behind a `SceneProvider` seam wired in `factory.ts`; offline `mock`
      returns a neutral, "standard interior, no tilt, ambient light" analysis.
- [ ] Run scene analysis **in parallel** with the cutout fetch in the workflow (`Promise.all` over the
      independent pre-passes). Pass the result into `ComposeInput.scene` — **already honored by the compose
      prompt** today; extend `compose.ts` to actually use the richer fields (lighting, surfaces, scale, the
      `isExterior` flag instead of relying on the category, and the placement region).
- [ ] **Scale wiring:** combine `roomScale` with the product's real-world `dimensions` (already collected)
      so the compose task tells the model the correct product size instead of letting it guess (fixes the
      "wrong real-world scale" failure).
- [ ] Make scene analysis **best-effort**: low confidence or an error → fall back to today's behavior
      (compose without scene facts). It must never fail an otherwise-good generation.
- [ ] Tests (red-first): scene provider input/output + schema parse; mock neutrality; `compose.ts`
      includes scene facts when present and omits cleanly when absent; scale fact derived from
      roomScale × dimensions.

**Note on "no categories":** `SceneAnalysis` returns continuous facts about *that* photo (tilt, light
direction, surface orientation), not discrete buckets. This reinforces the category-agnostic design; it
does not reintroduce a taxonomy.

**DECISIONS.md (paste, English):**
```
D64 — Scene-analysis vision pass wired into compose.
Context: the single-shot compositor degraded on noisy rooms because it had to infer geometry/lighting/
scale from the raw image. Decision: add a SceneProvider (gemini-2.5-flash generateObject) returning a
per-image SceneAnalysis (interior/exterior, lighting direction/intensity, surface map, tilt estimate,
room scale, placement region, quality flags, confidence) validated by a shared Zod schema. It runs in
parallel with the cutout pre-pass and feeds ComposeInput.scene (already honored by the prompt). Room scale
is combined with the product's real dimensions to size the product correctly. The pass is best-effort:
low confidence / errors fall back to the prior compose behavior. This is per-image understanding, NOT a
category taxonomy — the category remains a soft hint only.
```

---

## Phase 3 — Input normalization (deskew + auto-level) with sharp

**Objective:** straighten and clean the room **before** compose so the model sees the easy case, and use
the normalized room as the new baseline for the pixel-perfect composite (shrinking the drift problem).

- [ ] Add `apps/api/src/lib/images/normalize.ts`:
      - **Deskew:** rotate by `-tiltDegrees` (from Phase 2), **clamped to a gentle max** (e.g. ±8°) so the
        room still looks like the user's room. Rotating a rectangle introduces wedge borders → **crop to
        the largest inscribed rectangle** of the original aspect, then re-read dims.
      - **Auto-level:** apply `sharp().normalize()` / gamma **only** when `quality.dark` (or low contrast)
        is set — don't over-process good photos.
      - Keep the existing downscale + EXIF strip; fold sanitize+normalize into one canonical-room step.
- [ ] The **aspect-ratio pin** (`images/dimensions.ts`) reads the **normalized** dims; the pixel-perfect
      composite blends over the **normalized** room (the returned image may be gently deskewed vs the raw
      upload — intended).
- [ ] All transform math lives in **pure helpers** (clamp, inscribed-rect crop, level decision), unit-tested
      like the existing image-pipeline helpers; `sharp` stays lazily loaded (`images/sharp.ts`) so a native
      issue degrades gracefully.
- [ ] Tests (red-first): deskew angle clamp; inscribed-rect crop dims; auto-level gating; canonical-room
      pipeline produces expected dims; aspect pin uses normalized dims.

**Env:** `DESKEW_MAX_DEGREES` (default 8), `AUTOLEVEL_ENABLED` (default true), with code defaults so they
work unset (consistent with the existing change-mask knobs).

**DECISIONS.md (paste, English):**
```
D65 — Room normalization (deskew + conditional auto-level) before compose.
Context: tilted/dark/unclear rooms produced distorted composites, and the pixel-perfect composite fell
back to the (re-framed) full render when the model "corrected" the framing. Decision: normalize the room
server-side with sharp before compose — gentle deskew using SceneAnalysis.tiltDegrees (clamped to
±DESKEW_MAX_DEGREES, cropped to the largest inscribed rectangle to remove rotation wedges) and conditional
auto-level when the scene flags dark/low-contrast. The normalized room becomes the baseline for the
aspect-ratio pin and the pixel-perfect blend, so the returned image may be slightly straightened vs the
raw upload (acceptable: it still depicts the user's room and looks better). Deskew is intentionally gentle
to avoid an uncanny perspective warp.
```

---

## Phase 4 — Routing & speed (only after Phases 1–3 pass the eval gate)

**Objective:** now that inputs are clean, make the **fast** model the common path and escalate to quality
only when needed; reduce output size where imperceptible; parallelize pre-passes. This is the big latency
win, **unlocked** by the robustness work.

- [ ] In `factory.ts`, change `planToPolicy` / the provider chains so the **common path defaults to fast**.
      Escalate to the **quality** model when warranted — e.g. `SceneAnalysis.quality` flags difficulty
      (blurry/dark/cluttered) or low confidence, plus the existing plan tier (scale/enterprise may still
      prefer quality). Keep the chain fallback (fast → quality) intact for resilience.
- [ ] **Output size per policy:** fast path generates at **1K** (optionally upscale via sharp) and the
      quality path at **2K**. Validate 1K vs 2K on the eval set — for a "try in your room" preview 1K is
      often indistinguishable and much faster. Drive via `GATEWAY_IMAGE_SIZE` extended to per-policy.
- [ ] **Parallelize** the independent pre-passes in the workflow (scene analysis + cutout, plus
      EXIF-strip/normalize where independent) with `Promise.all`.
- [ ] **Lightweight drift guard** (small, independent safety net): when the diff is a global, edge-dominant
      change (a re-frame signature) rather than a localized product change, retry compose **once** with a
      stronger "do not move/rotate/re-crop the camera" instruction before falling back to the full render.
      (Phase 5 largely dissolves this, so keep it minimal.)
- [ ] **Measure against the Phase 0 baseline** and record the latency/quality/cost deltas in the eval
      output. Ship only if quality holds.
- [ ] Tests (red-first): routing selects fast for standard/low-difficulty and escalates on
      difficulty/low-confidence; per-policy image size resolves correctly; drift-guard triggers on a
      synthetic global-change mask and not on a localized one.

**DECISIONS.md (paste, English):**
```
D66 — Routing defaults to the fast composite model; quality on demand.
Context: balanced started on the pro model, so most paying merchants paid ~60s latency even on easy cases.
Decision (sequenced AFTER input normalization so quality is preserved): default the common path to the
fast image model and escalate to the quality model only when SceneAnalysis flags a difficult image
(blurry/dark/cluttered/low-confidence) or for the top plan tiers; keep the fast→quality fallback chain.
Generate at 1K on the fast path (optional sharp upscale) and 2K on the quality path, validated on the
eval set. Pre-passes (scene analysis + cutout + normalize) run in parallel. A lightweight drift guard
retries compose once with a stronger "do not re-frame" instruction when the diff looks like a global
re-frame, before falling back to the full render.
```

---

## Phase 5 — Layout-guided composite (rough composite → refine) [the big bet]

**Objective:** convert the open-ended generation into a **constrained refinement**. Build a crude composite
(clean cutout pasted into the room at an estimated position/scale) and ask the model to **harmonize** it —
integrate lighting, add contact shadows, fix edges/perspective, keep product identity and room exactly.
This localizes the model's changes → clean diff-mask → the pixel-perfect composite finally works on hard
inputs → and the fast model becomes reliable. Do this **only after Phases 1–4 prove out**.

- [ ] Add `apps/api/src/lib/images/layout.ts`: given the cutout + `SceneAnalysis.suggestedPlacement` +
      `roomScale` + product `dimensions`, compute a paste transform (**start with position + scale only**,
      let the model fix perspective; add rough perspective later if needed) and `sharp`-composite the cutout
      onto the normalized room → a rough composite image.
- [ ] Add a **refine-mode** prompt variant in `packages/ai/src/prompts/` (a flag on `buildComposeTask` /
      `buildComposePrompt`), instructing "refine, do not relocate." Keep the HARD RULES (product identity,
      environment integrity, framing, contact shadows).
- [ ] Extend the Gateway provider to pass `[normalized room, rough composite]` (and/or the cutout) as image
      parts, with the refine prompt. Keep the injectable runner so ordering/extraction stay unit-tested.
- [ ] Pixel-perfect composite now blends over the normalized room as before, but the diff is localized to
      the product region — verify the mask stays clean and `shouldComposite` no longer falls back on hard
      inputs.
- [ ] **A/B on the golden set** vs the Phase 1–4 pipeline. **Ship only if it beats it.** If layout
      estimation is unreliable for some scenes, fall back to the Phase 1–4 (no-rough-composite) path.
- [ ] Tests (red-first): layout transform math (position/scale from placement+scale+dims); refine-mode
      prompt selected when a rough composite is present; provider assembles the right image parts; fallback
      to the non-layout path when placement confidence is low.

**Risk/rollback:** placement/scale estimation is the hard part. Mitigations: start position+scale only;
gate on placement confidence with a clean fallback to the Phase 1–4 path; ship behind the eval A/B.

**DECISIONS.md (paste, English):**
```
D67 — Layout-guided compose (rough composite → refine), superseding the open-ended single-shot for the
common path. Context: asking the model to decide placement from scratch was the main source of weird
results and forced the diff-mask composite to guess. Decision: build a crude composite (clean cutout
pasted into the normalized room at an estimated position/scale from SceneAnalysis + product dimensions)
and run the image model in REFINE mode ("harmonize lighting/shadows/edges/perspective, do not relocate or
re-frame, preserve product identity and room"). This localizes changes so the pixel-perfect composite
(D62) produces a clean mask and stops falling back on hard inputs, and it lets the fast model handle the
common path. Placement estimation starts position+scale only (model fixes perspective); low placement
confidence falls back to the Phase 1–4 path. Shipped only after beating the prior pipeline on the eval
golden set. FLUX.1 Fill remains rejected (text-only, can't reproduce the exact product).
```

---

## 6. Open decisions to resolve during Phase 0/1 (A/Bs)

- [ ] **Cutout provider default:** Replicate matting (fidelity-preserving) vs Gemini-edit — A/B on ~15–20
      real products. (Lean: Replicate matting.)
- [ ] **Eager vs lazy cutout:** compute on product upsert (no first-gen penalty) vs lazy-on-first-gen.
      (Lean: eager via Inngest + lazy guard as backstop.)
- [ ] **1K vs 2K on the fast path:** validate perceptual quality on the eval set.
- [ ] **Layout-guided perspective scope (Phase 5):** position+scale only first; add rough perspective only
      if the eval shows it's needed.

## 7. Workflow conventions for Claude Code

- [ ] Branch off `master` (e.g. `feat/generation-engine-v2-phaseN`); **commit only when the owner asks**;
      Conventional Commits; end messages with the repo's `Co-Authored-By` trailer.
- [ ] Update `docs/DECISIONS.md` with the drafted D63–D67 entries as each phase lands; update affected
      per-package READMEs (`packages/ai/src/prompts/README.md`, `packages/ai/README.md`) and `lumina.md`
      §8/§9 when behavior changes.
- [ ] Keep `.env.example` current with the new vars (`REPLICATE_API_TOKEN`, `BG_REMOVAL_*`,
      `DESKEW_MAX_DEGREES`, `AUTOLEVEL_ENABLED`, per-policy image size). Never commit `.env*`.
- [ ] **Fetch current docs before using these fast-moving APIs** (don't rely on memory): Vercel AI SDK 6
      (`generateObject`, multi-image message parts, `providerOptions.google.imageConfig`), the Gemini image
      model params, `sharp` (rotate/extract/normalize/composite), the chosen Replicate matting model's
      API, and Inngest function/step patterns.
- [ ] **Definition of Done per phase:** lint clean · typecheck clean · deterministic tests written first
      and passing · eval harness run and numbers reported (no quality regression on standard cases) · no
      secret committed · tenant scoping intact on new R2 keys · credit/refund invariants unchanged · docs
      + DECISIONS updated · Conventional Commit (when asked).

---

## 8. Summary

The engine is fragile because it asks one model to do everything at once on raw inputs, and the realism
composite silently degrades exactly when inputs are hard. The fix is to **clean and constrain the inputs**
(cutout, scene analysis, normalization), which both hardens quality and unlocks the **fast** model for
speed — without any category taxonomy and almost entirely on the existing stack. Sequence: measure
(Phase 0) → cutout + scene analysis (Phases 1–2, the foundation) → normalization (Phase 3) → routing/speed
(Phase 4, unlocked by the above) → layout-guided refine (Phase 5, the big bet). Each phase is gated by the
eval harness so quality is proven, not assumed.

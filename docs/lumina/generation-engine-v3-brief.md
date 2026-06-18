# LUMINA — Generation Engine v3 Brief (Planner-Driven Compose)

> **This is a standalone brief for Claude Code. Read it fully before writing any code.**
> It supersedes `generation-engine-v2-plan.md`. Before starting, read these repo files for ground truth:
> `CLAUDE.md` (hard rules), `docs/lumina/lumina.md` (full spec — data model, API, AI pipeline, workflow),
> `docs/DECISIONS.md` (decision log), and the post-mortem `generation-engine-v2-outcome.md` (what the
> previous attempt did and why it failed — do not repeat those mistakes).
>
> **Three process rules are NON-NEGOTIABLE, because the last attempt broke all three:**
> 1. **Get instruments first.** Capture an eval-harness baseline on real cases *before* changing anything,
>    and re-run the eval gate after *every* phase. Never claim a quality improvement without an eval run.
>    Report numbers honestly; if a step was skipped or failed, say so.
> 2. **Verify the foundation on the deployed environment, not just locally.** The previous attempt was
>    crippled for many commits by `sharp` failing silently on the Inngest function. Confirm `sharp` actually
>    runs in staging before building on top of it.
> 3. **No flying blind, no thrashing.** Do the de-risking spike in Phase 0 and report results to the owner
>    *before* committing to the covering approach in Phase 2.
>
> **Working rules:** TDD (red → green → refactor; deterministic tests fail first). Conventional Commits.
> Branch off `master` first; **commit only when the owner explicitly asks**; end commit messages with the
> repo's `Co-Authored-By` trailer. Record each non-obvious decision in `docs/DECISIONS.md` (check the
> current highest `Dnn` number and continue from there). All code, comments, identifiers, tests, and docs
> in **English**. Before using a fast-moving API (Vercel AI SDK 6 / Gateway, `sharp`, Replicate, Inngest,
> Drizzle, Supabase), **fetch the current docs** instead of relying on memory.

---

## 1. Objective

LUMINA's core value is the **generation engine**: from a **product image + product metadata** and an
**environment image** (interior *or* exterior), produce a photorealistic composite that looks like an
unedited photo of the user's own environment containing the exact, purchasable product — correct
placement, real-world scale, perspective, lighting, and contact shadows.

It must work **robustly across non-standard inputs** (tilted/ambiguous/dark/blurry rooms, exteriors,
non-studio product photos), not just the easy "living room + chandelier" case, and it must be **fast**.

**Critically, the engine must correctly handle different *kinds* of product, inferred per image — not via a
hardcoded category taxonomy:**
- **Surface coverings** (acoustic panels, tiles, wallpaper, flooring, decking) must **clad a surface**,
  repeated to cover the area, in correct perspective — not appear as one isolated unit.
- **Replacements** (a new wardrobe for an existing one, a new shower, a new door) must **replace the
  existing element** in the scene, matching its position/scale/perspective.
- **Placed objects** (lamp, sofa, mirror, chandelier) must be placed **once** at the natural or specified
  location.

**Success criteria**
- On the eval golden set (incl. non-standard inputs and the reference case in §3.1), 👍 quality materially
  above the captured baseline, with **no regression** on the standard cases that already work.
- Product fidelity preserved (geometry, material, color, branding) — a hard rule.
- The reference case (§3.1) renders as a **covered wall**, **not rotated**, **not a single crooked panel**,
  **not raw pasted copies**.
- Latency reduced vs. today (the previous attempt likely made it *worse* — see §2.4). Target for the common
  path: **p50 < 15s, p95 < 30s** (validate against real model latency in Phase 0).

---

## 2. Current situation (state of the code + why the last attempt failed)

The pipeline today (`master` @ `ac16e42`) is **single-pass generative compose**: one multimodal
`generateText` call (room image + product image) on a Google image model via the Vercel AI Gateway, with
the aspect ratio pinned to the room, followed by a "pixel-perfect composite" (`sharp` diff-mask + blend
over the original room). All model calls go through `AIOrchestrator` (`packages/ai`); prompts live in
`packages/ai/src/prompts/`; the durable workflow is Inngest (`apps/api/src/lib/inngest/`); image ops are in
`apps/api/src/lib/images/`.

A "Generation Engine v2" effort was attempted and **did not work**. Honest summary of its aftermath
(see `generation-engine-v2-outcome.md`):

### 2.1 The dominant failure was infrastructure, not design
`sharp` failed silently on the Vercel Inngest function (`ERR_DLOPEN_FAILED: libvips-cpp.so`, a pnpm
file-tracing miss). Every `sharp` call is wrapped in try/catch, so it failed **without errors for many
commits**. While it was dead, these were all **no-ops simultaneously**: room normalization/deskew, the
**aspect-ratio pin**, EXIF baking, and the **pixel-perfect composite**. So the quality work was never
actually exercised. This is now fixed (`6d8f605`/`9c96652`), and `GET /internal/sharp-check` exists to
verify `sharp` on Vercel. **This fix is the one thing that genuinely mattered, and it must be re-verified in
staging (§Phase 0).**

### 2.2 No instruments → thrashing
The Phase 0 eval baseline was skipped, so nobody could see that `sharp` was dead, and the coverage feature
was built and reverted **three times** on guesses.

### 2.3 Wrong mental model for coverings + dead code
Coverage was implemented as **"paste N copies of the product"** (deterministic tiling). This is the wrong
model and produced the "raw panels pasted with no generation" result. It was abandoned; the code is now
**dormant dead code in the tree** and must be removed: `images/layout.ts`, `prompts/refine.ts`,
`ComposeInput.layout`, the gateway `[layout, product]` branch, and the refine switch in `prompts/prompt.ts`.
At `ac16e42` coverage simply "composes from scratch like any product" — so the model treats a covering
product as a single object → **one isolated (often misaligned) unit**. This is the main remaining design
gap.

### 2.4 Deviations and a likely latency regression
- The product cutout was implemented as a **generative Gemini cutout** instead of the planned **matting**
  approach — this re-renders the product pixels and risks altering identity/branding (against the fidelity
  hard rule). (`bg-removal*.ts`)
- Phase 4 (routing/speed) **never ran**, and the Inngest route timeout was raised **60s → 300s**, which
  strongly suggests latency went **up** (pre-passes added without the fast-model offset).

### 2.5 What is actually in place now (reusable)
- A scene-analysis pass exists (`prompts/scene.ts`, `providers/gateway-scene.ts`) returning per-image facts
  (lighting/surfaces/tilt/scale). **Evolve this — don't rebuild it** (§Phase 1).
- EXIF auto-orient at ingest (`images/orient.ts`), room normalization (`images/normalize.ts`), and the
  product-cutout seam (`bg-removal*.ts`, `products.clean_image_key`) exist.
- Coverage quantity is computed and shown in the dashboard (the one genuinely new user-facing behavior).
- The pixel-perfect composite (`images/diff-mask.ts`, `images/composite.ts`, `images/dimensions.ts`,
  `images/sharp.ts`) and the eval harness (`apps/api/scripts/eval-golden.json`, `scoreEval`,
  `pnpm -F @lumina/api eval`) exist.

---

## 3. The problem (precise diagnosis)

**Root cause:** the engine asks a single model, in one pass, to do an open-ended, hard task on raw inputs —
understand the room, understand the product, decide the *kind* of operation, decide placement/scale, and
render lighting/shadows/perspective, all at once. With anything non-standard it degrades on all axes
together. **There is no explicit step that decides the generation *strategy*** (is this a covering? a
replacement? a single placement? how many, where, at what scale?) and produces a **task-specific
instruction** for the compositor. That decision is currently left to the single compose call, which gets it
wrong (e.g. one panel instead of a clad wall).

**Symptom separation (important — these are not the same problem):**
- **90° rotation of a portrait room** → EXIF + aspect-pin + `sharp` (outcome-doc-confirmed). With `sharp`
  alive and `orient.ts` baking EXIF, this should already be fixed at `ac16e42`. **Verify in Phase 0. It is
  not a reasoning problem — no planner fixes it.**
- **Raw product copies pasted, no generation** → the dead tiling code. Remove it (§2.3); it must not recur.
- **A single, often crooked unit instead of a covered surface** → the **real remaining design gap**:
  from-scratch compose treats a covering product as one object. This is what §4 fixes.

**Open capability question to resolve before building:** can the image model (Nano Banana Pro) actually
**re-surface a wall with a repeating product in correct perspective** when prompted to? This determines
whether the simple "mode-specific prompt" approach (§4) is enough, or whether covering needs a harder
perspective-warp fallback. **Phase 0 answers this with a manual spike.**

### 3.1 Reference test case (use this throughout)
- **Product:** "Pannello fonoassorbente" — a wooden acoustic panel, **60 × 60 × 0.5 cm**.
  Image: `https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSnlKibqBhQcld-7Lwa8Uta6w1g1SxlQMDO0Q&s`
- **Environment:** a **portrait** photo of a white bedroom wall, **slightly tilted framing**, with a
  ceiling light fixture in the **top-left** of the wall.
- **Expected good result:** the wall **clad with a grid of these panels**, in correct perspective and
  lighting, **portrait orientation preserved**, the product's exact look preserved. Use this case in the
  golden set and as the visual target for the Phase 0 spike.

---

## 4. The solution architecture: Planner → mode-specific compose

Add the missing reasoning step and make the compositor's task **specific to the kind of operation**. Two
ideas, one mental-model correction.

### 4.1 The Planner (a single cheap reasoning call)
**Evolve the existing scene analysis** into a planner that reasons over **both images + product metadata**
and returns a structured, Zod-validated `GenerationPlan`. It runs once (replacing the separate scene pass —
one call, not two) and feeds the compose step.

Proposed schema (in `packages/shared`, evolving the current scene schema — refine during impl):
```ts
GenerationPlan = {
  mode: 'surface_covering' | 'object_replacement' | 'object_placement',
  target: {
    description: string,                 // "the left wall", "the existing wardrobe", "the floor"
    region?: [number, number, number, number], // normalized bbox 0..1, optional
  },
  repetition: {
    kind: 'single' | 'grid' | 'rows' | 'area_fill',
    estimatedCount?: number,             // coverage ~unit count, clamp [1, 999]
  },
  scale: {
    productDimensionsCm?: { w?: number, h?: number, d?: number }, // echo known dims
    sceneScaleHint?: string,             // "ceiling ~2.7m", "door for reference"
  },
  sceneFacts: {
    isExterior: boolean,
    lighting: { direction: string, temperatureK?: number, intensity: 'low'|'medium'|'high' },
    surfaces: Array<{ kind: string, orientation?: string }>,
    tiltDegrees: number,
    quality: { blurry: boolean, dark: boolean, cluttered: boolean },
  },
  notes?: string,
  confidence: number,                    // 0..1
}
```
- Implement as `generateObject` (AI SDK 6, Zod) on the cheap model already used for quantity/scene
  (`gemini-2.5-flash`), behind the existing scene provider seam in `packages/ai` (one-file-swap rule).
- **Best-effort:** low confidence or error → fall back to `mode: 'object_placement'` with no extra facts
  (today's behavior). It must **never** fail an otherwise-good generation, and must never bill a failure.

> **`mode` is an *operation*, not a product category.** There are only ~3 modes, inferred per image. This
> is the opposite of a per-product-type taxonomy and stays scalable — exactly the constraint the owner
> requires. The merchant category stays a *soft hint* only.

### 4.2 Mode-specific compose (THE key correction)
From the plan, **deterministically assemble a task-specific compose instruction** in
`packages/ai/src/prompts/` (layered on top of the always-true `COMPOSE_SYSTEM_INSTRUCTION` in `system.ts`,
which keeps the fidelity / no-environment-alteration / keep-framing / contact-shadow rules). Starting
language (refine in Phase 0/2 against the eval set):

- **`surface_covering`** — *the mental-model fix:* treat the product as a **repeating surfacing unit** and
  render the surface **generatively re-clad**, NOT a single placement and NOT deterministic paste:
  > "Re-surface {target.description} with the supplied product, treating it as a repeating unit. Cover the
  > whole surface, repeating the product ({repetition.kind}) to fill the area, in correct perspective
  > relative to the surface and matching the scene's lighting and shadows. Preserve the product's exact
  > material, color, texture, proportions, and the gaps/edges between repeated units. Do NOT place a single
  > isolated unit. Keep the room, all other objects, and the original framing and aspect ratio exactly — do
  > not rotate, crop, or re-frame."

- **`object_replacement`**:
  > "Replace {target.description} in the scene with the supplied product, matching its position, scale, and
  > perspective. Preserve the product's exact identity (geometry, material, color, branding). Keep the rest
  > of the room and the original framing/aspect ratio exactly."

- **`object_placement`** (today's behavior):
  > "Place the supplied product once at {target.description} (or the most natural, functional location) at
  > correct real-world scale given its dimensions, with physically correct contact shadows and lighting
  > consistent with the scene. Preserve the product's exact identity. Keep the room and the original
  > framing/aspect ratio exactly."

### 4.3 Mode-dependent cutout
The product cutout strategy depends on `mode`:
- `object_placement` / `object_replacement` → **matting** cutout (alpha matte; composite the **original
  product pixels** through it, so fidelity is byte-preserved). Use a Replicate matting model (already
  MCP-connected; `replicate.ts` stub) behind the `BackgroundRemovalProvider` seam. **Switch away from the
  generative cutout** for these modes (it risks altering the product). Cache per product in
  `products.clean_image_key`.
- `surface_covering` → **do not cut out**; pass the **original product image** (the model needs the
  texture/pattern of the repeating unit).

### 4.4 Mode-aware pixel-perfect composite
- `object_placement` / `object_replacement` → localized change → keep the diff-mask blend over the
  normalized room (the realism guarantee works well here).
- `surface_covering` → most of the surface changes by design → **accept the full render** and rely on the
  **aspect-ratio pin + "keep framing" instruction** to prevent rotation/re-crop. Make this branch explicit
  and mode-driven (today `shouldComposite`'s max-fraction guard would fall back to the full render anyway —
  make it intentional, not accidental).

### 4.5 Resulting pipeline
```
load gen → flip processing
   ├─ (parallel) sanitize + EXIF-orient + normalize room → canonical room
   ├─ (parallel) planner: both images + product metadata → GenerationPlan
   └─ (parallel, mode-dependent) ensure product cutout (matting, cached) — only for object modes
            ↓ join
   moderate input
            ↓
   assemble mode-specific compose task from the plan
            ↓
   compose (Gateway) → mode-aware pixel-perfect composite
            ↓
   moderate output → store → coverage quantity (best-effort) → finalize
```

---

## 5. Hard constraints (from `CLAUDE.md` — do not violate)
- **AI provider abstraction:** all model calls via `AIOrchestrator`; new capabilities are provider seams in
  `packages/ai` wired in `factory.ts`. **No provider SDK calls in handlers or the workflow.**
- **Prompts surface:** all prompt text in `packages/ai/src/prompts/`. Never scatter prompt strings.
- **Validation/errors/types:** every input/output is a shared **Zod** schema in `packages/shared`; strict
  TS, no `any` (`unknown` + Zod); public endpoints keep `{ error: { code, message, requestId } }`.
- **Money/credits:** atomic `debit_credits()` before enqueue; **never bill a failed generation** (terminal
  failures refund via `grant_credits(...,'refund')`, idempotent guarded transition). New pre-passes that
  can fail are **best-effort** or **refund-and-fail** — never silently bill.
- **Migrations only via Drizzle**; Supabase MCP read-only.
- **Tenant isolation/privacy:** new R2 keys keep the `{merchant_id}/` prefix; EXIF/GPS stripping stays;
  moderation seam respected.
- **Widget budget:** all this work is server-side; do not touch the widget except optional progress copy.

---

## 6. Testing & process discipline (the #1 thing the last attempt got wrong)

**Two layers — do not skip either:**

1. **Deterministic unit tests, written red-first (real TDD).** Everything around the model is
   deterministic: planner provider input/output + schema parse + fallback; mode → prompt selection (the
   right task text appears for each mode); cutout strategy per mode + caching idempotency (2nd gen for the
   same product skips the provider); mode-aware composite branch selection; normalization math;
   routing/model selection (Phase 3); and the **invariants** (never bill a failed gen; refund idempotent
   across retries/`onFailure`; tenant scoping on new R2 keys).

2. **Eval harness as the quality gate (not a unit assertion).** Use `scoreEval` + `pnpm -F @lumina/api
   eval` over `apps/api/scripts/eval-golden.json`. **Capture the baseline in Phase 0**, expand the golden
   set with non-standard inputs **including the §3.1 reference case**, and **re-run after every phase**. Do
   not proceed if a phase regresses the standard cases. Report numbers; never assert a quality gain without
   an eval run.

---

## 7. The plan (phases — execute in order)

### Phase 0 — Verify the foundation, de-risk, and get instruments (MANDATORY FIRST; pause for owner review)
- [ ] **Verify `sharp` runs in staging** via `GET /internal/sharp-check` (not just locally). If it fails,
      fix the libvips/pnpm-tracing packaging before anything else — nothing downstream works without it.
- [ ] **Verify the 90° rotation is fixed** on `ac16e42` using the §3.1 case (EXIF baked, aspect pin holds,
      portrait preserved). Report the actual result.
- [ ] **Covering capability spike (manual, the key de-risk):** add a small throwaway script (or reuse the
      e2e/eval harness) that takes a product image + room image + a prompt, calls the orchestrator against
      the **real Gateway**, and saves the output. Test the `surface_covering` prompt language (§4.2) on the
      §3.1 panel/wall case and **save outputs for the owner to judge**. Goal: determine whether Nano Banana
      Pro can re-surface the wall with a grid of panels via prompting alone.
      - If **yes** → proceed with the prompt-only covering approach (Phases 1–2 as written).
      - If **no** → record it; the fallback is a deterministic **perspective-warp** of the product texture
        onto the detected wall plane (homography) + a generative refine pass. Document this as the
        alternative for Phase 2 and flag to the owner before building it.
- [ ] **Capture the eval baseline:** expand `apps/api/scripts/eval-golden.json` with non-standard inputs
      (tilted/dark/blurry rooms, exteriors, non-studio products, one per coverage case incl. §3.1); extend
      `scoreEval` to break results down by input class; run it and **record the baseline numbers**.
- [ ] **Report Phase 0 results to the owner and get a go/no-go on the covering approach before Phase 1.**

### Phase 1 — The Planner
- [ ] Evolve the scene-analysis schema into `GenerationPlan` (§4.1) in `packages/shared` (Zod).
- [ ] Implement the planner as a `generateObject` call on `gemini-2.5-flash` behind the existing scene
      provider seam; pass **both images + product metadata** (name, dimensions, soft category). Offline
      `mock` returns a neutral `object_placement` plan.
- [ ] Wire it into the workflow, in parallel with normalization and (object-mode) cutout.
- [ ] Make it best-effort with the `object_placement` fallback on low confidence/error.
- [ ] Tests (red-first): provider input/output + schema parse + fallback; mock neutrality; plan feeds
      compose.
- [ ] Run the eval gate; report vs baseline.

### Phase 2 — Mode-specific compose (+ remove dead tiling code)
- [ ] Add mode-specific compose-task assembly in `packages/ai/src/prompts/` (§4.2), layered on the existing
      `COMPOSE_SYSTEM_INSTRUCTION`. Select by `plan.mode`.
- [ ] **Remove the dormant tiling code** (`images/layout.ts`, `prompts/refine.ts`, `ComposeInput.layout`,
      the gateway `[layout, product]` branch, the refine switch in `prompts/prompt.ts`) — superseded by the
      generative re-surfacing approach. (If the Phase 0 spike chose the perspective-warp fallback, implement
      that here instead, behind a clean seam.)
- [ ] Mode-dependent cutout (§4.3): matting (Replicate, cached in `clean_image_key`) for object modes;
      original texture image for covering. Switch object-mode cutout away from the generative implementation
      for fidelity. Add env: `REPLICATE_API_TOKEN`, `BG_REMOVAL_PROVIDER`, `BG_REMOVAL_MODEL` to
      `.env.example`.
- [ ] Mode-aware pixel-perfect composite (§4.4): localized diff for object modes; accept full render +
      aspect pin for covering. Make the branch explicit.
- [ ] Tests (red-first): mode → task selection; cutout strategy per mode + caching idempotency; composite
      branch per mode; matting → composite preserves original product pixels.
- [ ] Run the eval gate; **the §3.1 case must now render as a clad wall, not rotated, not a single panel,
      not raw pasted copies.** Report vs baseline. Do not ship if standard cases regress.

### Phase 3 — Speed (only after quality holds in the eval gate)
- [ ] Parallelize independent pre-passes in the workflow (planner + cutout + normalize) with `Promise.all`.
- [ ] In `factory.ts`, default the **common path to the fast model**, escalating to the quality model on
      `plan.sceneFacts.quality` difficulty flags / low confidence (and for top plan tiers). Keep the
      fast→quality fallback chain.
- [ ] Generate at **1K** on the fast path (optional `sharp` upscale), **2K** on the quality path; validate
      1K vs 2K on the eval set. Drive via `GATEWAY_IMAGE_SIZE` per policy.
- [ ] **Undo the latency regression:** confirm the Inngest route timeout can be brought back down now that
      the silent-`sharp` retries and redundant passes are gone; measure p50/p95 in Axiom vs the Phase 0
      baseline.
- [ ] Tests (red-first): routing selects fast for easy/low-difficulty and escalates on difficulty; per-
      policy image size resolves. Run the eval gate; report latency + quality deltas.

---

## 8. DECISIONS.md entries to record (check current highest `Dnn` and continue)
Record, in English, as each phase lands:
- **Planner-driven compose.** A single cheap `gemini-2.5-flash` planner (evolved from scene analysis)
  reasons over both images + product metadata and returns a structured `GenerationPlan` (operation **mode**
  = surface_covering | object_replacement | object_placement, target, repetition/count, scale, scene facts,
  confidence). Mode is an *operation* inferred per image, NOT a product-category taxonomy. Best-effort with
  an `object_placement` fallback.
- **Mode-specific compose, and the covering correction.** The compositor task is assembled per mode.
  Surface coverings are rendered as **generative re-surfacing** (the product as a repeating unit clad over
  the surface in perspective) — explicitly rejecting both deterministic tiling (the v2 "paste N copies"
  approach that produced raw pasted panels) and single-object placement. The dormant tiling code
  (`layout.ts`, `refine.ts`, `ComposeInput.layout`, the gateway layout branch) is removed.
- **Mode-dependent cutout.** Matting (Replicate, alpha over original product pixels, cached in
  `clean_image_key`) for object placement/replacement (fidelity-preserving); the v2 generative cutout is
  replaced for these modes because it re-renders the product. Coverings use the original texture image (no
  cutout).
- **Mode-aware pixel-perfect composite.** Localized diff-mask blend for object modes; full render + aspect
  pin for coverings (the surface must change by design).
- **Routing defaults to the fast model with on-demand quality escalation** (sequenced after the quality
  work), 1K on the fast path / 2K on quality, validated on the eval set.

---

## 9. Definition of Done (per phase)
Lint clean · typecheck clean · deterministic tests written first and passing · **eval harness run and
numbers reported, no regression on standard cases** · `sharp` verified on staging (Phase 0) · no secret
committed · tenant scoping intact on new R2 keys · credit/refund invariants unchanged · `.env.example` +
affected READMEs + `docs/lumina/lumina.md` (§8/§9) + `docs/DECISIONS.md` updated · Conventional Commit made
**only when the owner asks**, with the `Co-Authored-By` trailer.

---

## 10. One-paragraph summary
Generations are bad mainly because (a) `sharp` was silently dead so the prior quality work never ran
(now fixed — re-verify), and (b) there is no step that decides the *kind* of operation, so a covering
product is composed as a single object. The fix is a cheap **planner** that classifies the operation
(covering / replacement / placement) and a **mode-specific compose** that, for coverings, renders the
surface **generatively re-clad with the product as a repeating unit** — not tiled copies, not a lone
object. Cutout and the pixel-perfect composite become mode-aware. Verify the foundation and de-risk the
covering capability **first** (Phase 0 spike + eval baseline), gate every phase on the eval harness, and
handle speed only once quality is real.

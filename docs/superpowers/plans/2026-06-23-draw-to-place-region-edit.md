# Draw-to-Place (region_edit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a shopper draws on their room photo, place the product faithfully *where they drew*, keep the rest of their room intact, with no leftover strokes — for ANY product and ANY environment.

**Architecture (Option A — "trust the model + safety net", chosen by owner 2026-06-23):** The widget already sends the drawing as normalized **vector strokes** (`Annotation.strokes`), not a burned image — so the strokes are NEVER drawn into the model input (req c solved by construction). We compute the **drawn region** (bounding box of the strokes) and a **generic placement phrase** from its geometry, then run a **full-frame edit** on **fal.ai Seedream v4.5/edit** (faithful product, natural lighting — the output the owner preferred in the spike). A **drift safety-net** measures how much the model changed the room *outside* the drawn region: if small, ship the model output as-is (best quality); if large, composite the model output inside the drawn region over the byte-identical original (containment). Existing non-drawn generation paths (gateway/Gemini) are **untouched**.

**Tech Stack:** TypeScript strict · Next.js 15 API · Inngest workflow · `@lumina/ai` (AIProvider seam) · fal.ai Seedream v4.5/edit (`fetch` queue client, no SDK) · sharp · Zod in `packages/shared` · vitest.

## Global Constraints

- **Generic, not branchy:** ONE generic set of rigid prompt rules must work for any product/any environment. No per-product / per-category `if/else` trees in code or prompt. The only per-generation variation is data-derived: the placement phrase (from stroke geometry) and the product facts (name/category/dimensions already in the pipeline).
- **Additive:** New behavior is added behind the `AIProvider.compose()` seam and a new region branch. The existing non-drawn paths (object_placement / surface_covering / object_replacement / multi) keep using the gateway/Gemini chains and the existing composite — do NOT edit them. Owner baseline is 7/7 👍 on `pnpm -F @lumina/api eval`; it must stay 7/7.
- **HARD RULES (CLAUDE.md):** secrets only via env, never logged or client-side (FAL_KEY in Authorization header only); all model calls go through `AIProvider.compose()` (#8); every API input/output validated by a shared Zod schema (#5); strict TS, no `any` (#6); types flow via `packages/shared` (#6); tenant scoping intact (#1); schema changes only via Drizzle (#4 — this plan needs NONE: annotation already stored in `generations.metadata`).
- **Definition of Done (every task):** lint clean · typecheck clean · tests written first and passing · Conventional Commit · no secret committed.
- **Fal facts (from spike):** model `fal-ai/bytedance/seedream/v4.5/edit`; inputs `prompt` (req), `image_urls` (array, room first then products), `image_size` ({width,height}, total px must be ≥ 2560×1440 ≈ 3.69MP and ≤ 4096²); output `images[0].url`; ~$0.04/img; ~27–42s. Queue API: POST `https://queue.fal.run/{endpoint}` → `{status_url,response_url}`; poll status until `COMPLETED`; GET response_url. Auth header `Authorization: Key ${FAL_KEY}`. fal accepts public URLs (our R2 CDN URLs) directly as image inputs; pass bytes as a `data:` URI fallback.

---

## File Structure

- `packages/shared/src/region.ts` (CREATE) — `DrawnRegionBox` type + `regionFromStrokes(annotation)` + `placementPhrase(box)`. Pure, generic.
- `packages/shared/src/index.ts` (MODIFY) — export the new region module.
- `packages/ai/src/types.ts` (MODIFY) — add `ComposeInput.region?` (the drawn region + placement phrase + soft product-kind hint).
- `packages/ai/src/providers/fal.ts` (CREATE) — `FalProvider implements AIProvider` (Seedream v4.5/edit; injectable runner).
- `packages/ai/src/prompts/compose.ts` (MODIFY) — add generic `buildRegionEditTask(input)`; route it from `buildComposePrompt` when `input.region` is set; remove the dead `annotationFact` (strokes are no longer burned/surfaced by colour).
- `packages/ai/src/orchestrator.ts` (MODIFY) — add `regionChain?: AIProvider[]` to config; `compose()` uses it when `input.region` is present (existing retry/fallback loop unchanged).
- `packages/ai/src/factory.ts` (MODIFY) — build `regionChain` from env (FAL_KEY ⇒ `[fal, gatewayQuality]`, else `[gatewayQuality]`); pass to orchestrator.
- `packages/ai/src/index.ts` (MODIFY) — export `FalProvider`.
- `apps/api/src/lib/images/region.ts` (CREATE) — `driftOutsideRegion(original, raw, box)` (fraction changed outside the box) + `containInRegion({original, edited, box, feather})` (composite edited inside dilated box over original). Built on existing `computeChangeMask`, `rasterizeMask`, `compositeOverOriginal`.
- `apps/api/src/lib/inngest/workflow.ts` (MODIFY) — drawn branch: clean room (no burn) → set `input.region` → compose (region chain) → drift safety-net. Non-drawn branch untouched. Remove the `burnAnnotation` call from the drawn path.
- Tests: `packages/shared/test/region.test.ts`, `packages/ai/test/fal.test.ts`, `packages/ai/test/prompt.test.ts` (extend), `apps/api/.../region.test.ts`, workflow test (extend).

---

# Milestone R1 — Fal/Seedream provider behind AIProvider

**Deliverable:** A unit-tested `FalProvider` that turns a `ComposeInput` into a Seedream v4.5/edit call and returns image bytes; wired as the region chain in the factory + orchestrator, gated on `FAL_KEY`. No generation behavior changes yet (region branch not wired in the workflow until R3).

### Task R1.1: FalProvider with injected runner

**Files:**
- Create: `packages/ai/src/providers/fal.ts`
- Test: `packages/ai/test/fal.test.ts`
- Modify: `packages/ai/src/index.ts` (export `FalProvider`)

**Interfaces:**
- Consumes: `AIProvider`, `ComposeInput`, `ImageRef`, `ProviderResult` from `../types.js`.
- Produces:
  - `type FalRunner = (args: { model: string; prompt: string; images: ImageRef[]; imageSize: { width: number; height: number } }) => Promise<{ bytes: Uint8Array; contentType: string; width?: number; height?: number }>`
  - `interface FalProviderOptions { name: string; model: string; costCents: number; falKey?: string; run?: FalRunner }`
  - `class FalProvider implements AIProvider { readonly name; compose(input, prompt): Promise<ProviderResult> }`
  - `function falImageSize(aspectRatio: string | undefined): { width: number; height: number }` — parse `"W:H"`, return room-aspect size at ~4MP, clamped ≤4096 (≥3.69MP guaranteed); default 1:1 when absent.

- [ ] **Step 1: Write the failing test** (`packages/ai/test/fal.test.ts`)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { FalProvider } from '../src/providers/fal.js';
import type { ComposeInput } from '../src/types.js';

const baseInput = (): ComposeInput => ({
  room: { url: 'https://cdn/room.jpg' },
  product: { url: 'https://cdn/product.png' },
  products: [{ url: 'https://cdn/product.png' }],
  category: 'lighting',
  aspectRatio: '4:3',
  policy: 'quality',
});

describe('FalProvider.compose', () => {
  it('sends ROOM first then PRODUCTS, a room-aspect ~4MP image_size, and maps the result', async () => {
    const run = vi.fn(async () => ({ bytes: new Uint8Array([1, 2]), contentType: 'image/jpeg', width: 2309, height: 1732 }));
    const provider = new FalProvider({ name: 'fal-seedream', model: 'fal-ai/bytedance/seedream/v4.5/edit', costCents: 4, run });

    const result = await provider.compose(baseInput(), 'PROMPT');

    const call = run.mock.calls[0]![0];
    expect(call.model).toBe('fal-ai/bytedance/seedream/v4.5/edit');
    expect(call.prompt).toBe('PROMPT');
    expect(call.images).toEqual([{ url: 'https://cdn/room.jpg' }, { url: 'https://cdn/product.png' }]);
    expect(call.imageSize.width * call.imageSize.height).toBeGreaterThanOrEqual(2560 * 1440);
    expect(Math.abs(call.imageSize.width / call.imageSize.height - 4 / 3)).toBeLessThan(0.02);
    expect(result).toMatchObject({ contentType: 'image/jpeg', model: 'fal-ai/bytedance/seedream/v4.5/edit', costCents: 4, width: 2309, height: 1732 });
    expect(result.bytes).toEqual(new Uint8Array([1, 2]));
  });
});
```

- [ ] **Step 2: Run test → FAIL** — `corepack pnpm -F @lumina/ai test -- fal` → "Cannot find module '../src/providers/fal.js'".

- [ ] **Step 3: Implement `FalProvider`** — `compose` builds `images = [input.room, ...(input.products ?? [input.product])]`, `imageSize = falImageSize(input.aspectRatio)`, calls `this.run`, returns `{ bytes, contentType, model: this.opts.model, costCents: this.opts.costCents, width, height }`. The default runner (used when `run` not injected) implements the fal queue client (submit → poll `status_url` every 2s until `COMPLETED`, 240s cap → GET `response_url` → fetch `images[0].url` bytes; image inputs: `{url}` → string URL, bytes → `data:` URI). FAL key from `opts.falKey`. Never log the key.

- [ ] **Step 4: Run test → PASS.**

- [ ] **Step 5: Commit** — `feat(ai): add fal Seedream provider behind AIProvider (region_edit)`.

### Task R1.2: Orchestrator region chain routing

**Files:** Modify `packages/ai/src/orchestrator.ts`; Test: `packages/ai/test/orchestrator.test.ts` (extend).

**Interfaces:**
- Consumes: existing `AIOrchestratorConfig { chains; bgRemoval; planner; quantity }`.
- Produces: `AIOrchestratorConfig.regionChain?: AIProvider[]`. `compose()` selects `regionChain` when `input.region` is set AND `regionChain?.length`, else `chains[input.policy]`.

- [ ] **Step 1: Failing test** — with a config whose `regionChain = [spyFal]` and `chains.quality = [spyGateway]`, `compose({...input, region: {...}})` calls `spyFal.compose`, not `spyGateway.compose`; without `region` it calls `spyGateway`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — one line picking the chain: `const chain = input.region && this.config.regionChain?.length ? this.config.regionChain : this.config.chains[input.policy];` (rest of retry/fallback unchanged).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(ai): route region edits to a dedicated provider chain`.

### Task R1.3: Factory wiring (FAL_KEY-gated)

**Files:** Modify `packages/ai/src/factory.ts`; Test: `packages/ai/test/factory.test.ts` (extend).

**Interfaces:**
- Env: `FAL_KEY` (presence enables fal region chain), `FAL_IMAGE_MODEL` (default `fal-ai/bytedance/seedream/v4.5/edit`), `FAL_COST_CENTS` (default `4`).
- Produces: `regionChain = env.FAL_KEY ? [new FalProvider({...}), quality] : [quality]`, passed into `new AIOrchestrator({ ..., regionChain })`. Mock path: `regionChain = [mock]`.

- [ ] **Step 1: Failing test** — `createOrchestratorFromEnv({ AI_GATEWAY_API_KEY:'k', FAL_KEY:'id:secret' })` produces an orchestrator that routes a `region` compose to a provider whose `name` starts with `fal` (assert via a spy or by inspecting the configured regionChain through a test seam). With no `FAL_KEY`, region falls back to the gateway quality provider.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the wiring above; mock branch sets `regionChain:[mock]`.
- [ ] **Step 4: Run → PASS** + `corepack pnpm -F @lumina/ai test` (whole package green).
- [ ] **Step 5: Commit** — `feat(ai): wire fal region chain in factory (FAL_KEY-gated, gateway fallback)`.

**Milestone R1 review checkpoint:** package `@lumina/ai` lint+typecheck+test green; no behavior change to existing generations. PAUSE for review.

---

# Milestone R2 — Generic region geometry + generic prompt

**Deliverable:** Pure, generic helpers that turn strokes → region box → placement phrase, and a single generic `region_edit` prompt that works for any product/environment. TDD.

### Task R2.1: `regionFromStrokes` + `placementPhrase` (shared)

**Files:** Create `packages/shared/src/region.ts`; Modify `packages/shared/src/index.ts`; Test `packages/shared/test/region.test.ts`.

**Interfaces:**
- `interface DrawnRegionBox { x: number; y: number; w: number; h: number }` (normalized 0..1, origin top-left).
- `function regionFromStrokes(annotation: Annotation): DrawnRegionBox` — bbox over all stroke points, clamped to [0,1], min size 0.04, padded by 6% of its own size (so the object/silhouette has breathing room).
- `function placementPhrase(box: DrawnRegionBox): string` — geometry → generic English phrase. Horizontal third of center x → `left|central|right`; vertical third of center y → `upper|middle|lower`; area = `w*h`: ≥0.5 ⇒ "across most of the {h}-{v} area", else "in the {h} {v} area". e.g. `{x:.64,y:.22,w:.31,h:.7}` → "in the right area".

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { regionFromStrokes, placementPhrase } from '../src/region.js';

describe('regionFromStrokes', () => {
  it('returns the padded, clamped bbox of all stroke points', () => {
    const ann = { color: '#fff', alpha: 0.6, width: 0.012, strokes: [{ points: [{ x: 0.7, y: 0.3 }, { x: 0.9, y: 0.8 }] }] };
    const b = regionFromStrokes(ann as never);
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w).toBeLessThanOrEqual(1); expect(b.y + b.h).toBeLessThanOrEqual(1);
    expect(b.x).toBeLessThan(0.7); expect(b.x + b.w).toBeGreaterThan(0.9); // padded around the points
  });
});

describe('placementPhrase', () => {
  it('maps a right-side region to a right phrase', () => {
    expect(placementPhrase({ x: 0.64, y: 0.22, w: 0.31, h: 0.5 })).toMatch(/right/);
  });
  it('maps a centered large region to an "across most" phrase', () => {
    expect(placementPhrase({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })).toMatch(/across most/);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `corepack pnpm -F @lumina/shared test -- region`.
- [ ] **Step 3: Implement** the two pure functions + export from `index.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(shared): derive drawn region box + generic placement phrase from strokes`.

### Task R2.2: `ComposeInput.region` + generic `buildRegionEditTask`

**Files:** Modify `packages/ai/src/types.ts`, `packages/ai/src/prompts/compose.ts`; Test `packages/ai/test/prompt.test.ts` (extend).

**Interfaces:**
- `ComposeInput.region?: { box: DrawnRegionBox; placement: string; productKind?: 'object' | 'surface' }` (import `DrawnRegionBox` from `@lumina/shared`). `productKind` is a SOFT prompt fact only (derived from planner mode upstream) — never a code branch.
- `buildComposePrompt(input)`: if `input.region` is set, return `buildRegionEditTask(input)` (before mode branching).
- Remove `annotationFact()` and the `annotation:{color}` prompt path (dead once strokes are no longer burned). Keep `ComposeInput.annotation` field deletion to R3 (workflow stops sending it) to avoid a cross-package break in one commit — here just stop *referencing* it in prompts.

The generic rules text (rigid, product/environment-agnostic):

```
TASK: Add the shopper's product into THIS room photo, only in the indicated area. Output a single photorealistic image.

RULES (apply to ANY product and ANY room):
1. PRODUCT FIDELITY — Reproduce the product EXACTLY as in the reference image(s): same shape, proportions, colour, material, texture and finish. If a reference shows only part of it, faithfully reconstruct the rest in the same style. Never substitute, restyle, recolour or invent a different product.
2. PLACEMENT — Put the product {placement}. Keep it within that area; do not recentre or move it elsewhere.
3. SCALE & FIT — Size it to plausibly fill the indicated area, respecting real-world proportions and the room's perspective. If it is a surface finish (panels/tiles/wallpaper/paint/cladding) clad the indicated surface; if it is a discrete object (lamp/chair/vase/rug) rest it in a physically plausible spot there with a natural contact shadow.
4. PRESERVE THE ROOM — Change nothing else: keep every existing wall, floor, window, door, furniture item, fixture, colour and the layout exactly as photographed. Add only the product and its own shadow/contact.
5. REALISM — Match the room's perspective, lighting direction, white balance and shadow softness. Do not add glow, bloom, lens flare or blown highlights; if the product is a lamp/light, render it switched OFF unless the room is dark. The result must look like a real photograph of THIS room with the product in it.
```

- [ ] **Step 1: Failing tests** (extend `prompt.test.ts`):

```typescript
describe('buildComposePrompt — region_edit (draw-to-place)', () => {
  const base = { room:{url:'r'}, product:{url:'p'}, category:'lighting', policy:'quality' } as const;
  it('uses the generic region task with the placement phrase and the rigid rules', () => {
    const p = buildComposePrompt({ ...base, region: { box:{x:.64,y:.22,w:.31,h:.5}, placement:'in the right area' } } as never);
    expect(p).toContain('in the right area');
    expect(p).toMatch(/PRODUCT FIDELITY/);
    expect(p).toMatch(/PRESERVE THE ROOM/);
    expect(p).toMatch(/switched OFF unless/i);
  });
  it('contains no product-category if/else (same rules regardless of category)', () => {
    const a = buildComposePrompt({ ...base, category:'tiles', region:{ box:{x:.1,y:.1,w:.8,h:.8}, placement:'across most of the central area' } } as never);
    const b = buildComposePrompt({ ...base, category:'furniture', region:{ box:{x:.1,y:.1,w:.8,h:.8}, placement:'across most of the central area' } } as never);
    // Rule block identical; only data (placement/product facts) differs.
    expect(a.includes('PRODUCT FIDELITY')).toBe(true); expect(b.includes('PRODUCT FIDELITY')).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `buildRegionEditTask` + route in `buildComposePrompt`; delete `annotationFact` + its calls; keep product facts (`requestFacts`) appended after the rules.
- [ ] **Step 4: Run → PASS** + whole `@lumina/ai` test green (the old annotation prompt tests in `prompt.test.ts` lines ~220 must be replaced by these region tests).
- [ ] **Step 5: Commit** — `feat(ai): generic region_edit prompt (any product/any room), drop burned-stroke prompt path`.

**Milestone R2 review checkpoint:** shared + ai green. PAUSE for review.

---

# Milestone R3 — Workflow region_edit + drift safety-net (the end-to-end fix)

**Deliverable:** Drawing on a room now routes through the region path: clean room → region box + phrase → fal/Seedream full-frame → drift safety-net. Strokes never burned. Non-drawn paths untouched. This is the milestone the owner can test in Studio + widget.

### Task R3.1: image helpers — `driftOutsideRegion` + `containInRegion`

**Files:** Create `apps/api/src/lib/images/region.ts`; Test `apps/api/test/lib/images/region.test.ts`.

**Interfaces:**
- `function driftOutsideRegion(original: Uint8Array, edited: Uint8Array, box: DrawnRegionBox, opts?: { threshold?: number }): Promise<number>` — fraction (0..1) of pixels OUTSIDE the box that changed beyond threshold (default 22). Built on a per-pixel diff at the original's dims (mirror `computeChangeMask`'s loop, gate by box membership).
- `function containInRegion(opts: { original: Uint8Array; edited: Uint8Array; box: DrawnRegionBox; feather?: number; contentType?: string }): Promise<{ bytes: Uint8Array; contentType: string }>` — `rasterizeMask` of the box (dilated ~6%, feather default = 1.5% of long edge) then `compositeOverOriginal(edited inside, original outside)`.

- [ ] **Step 1: Failing test** — synthesize a 40×40 original (solid grey) and an edited copy where only the box area + a few outside pixels differ; assert `driftOutsideRegion` ≈ (outside-changed / outside-total) and that `containInRegion` returns original bytes outside the box (sample a corner pixel) and edited inside.
- [ ] **Step 2: Run → FAIL** — `corepack pnpm -F @lumina/api test -- region`.
- [ ] **Step 3: Implement** both using `loadSharp`, `rasterizeMask`, `compositeOverOriginal`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(api): region drift measurement + containment composite helpers`.

### Task R3.2: workflow region branch + safety-net

**Files:** Modify `apps/api/src/lib/inngest/workflow.ts`; Test: workflow test (extend the existing inngest workflow test).

**Interfaces:**
- Consumes: `readAnnotation(gen)` (exists), `regionFromStrokes`, `placementPhrase` (`@lumina/shared`), `driftOutsideRegion`, `containInRegion` (new), `orchestrator.compose` (region chain).
- Env: `REGION_DRIFT_MAX` (default `0.06`).
- Behavior: when `annotation` present —
  1. Do NOT call `burnAnnotation`; `roomForModel = { url: roomUrl }` (clean).
  2. `const box = regionFromStrokes(annotation); const region = { box, placement: placementPhrase(box), productKind: genPlan.mode === 'surface_covering' ? 'surface' : 'object' };`
  3. `compose({ room: cleanRoom, ..., region, /* no annotation field */ })` → routes to region chain.
  4. `const drift = await driftOutsideRegion(normalized, composed.bytes, box);`
  5. `finalImage = drift > REGION_DRIFT_MAX ? await containInRegion({ original: normalized, edited: composed.bytes, box }) : { bytes: composed.bytes, contentType: composed.contentType };`
  - When NO annotation: existing path entirely unchanged (gateway chain, `keepOnlyProductChange`, etc.).

- [ ] **Step 1: Failing test** — with a mock orchestrator returning a known image and a stubbed `driftOutsideRegion`, assert: (a) `burnAnnotation` is NOT invoked when an annotation is present; (b) `compose` is called with `region.placement` set and no `annotation`; (c) when drift > max, `containInRegion` is used, else the raw bytes are saved. Use dependency injection / spies consistent with the existing workflow test harness.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the region branch; leave the non-annotation branch byte-for-byte unchanged. Remove the now-dead `burnAnnotation` import + the `annotation:{color}` compose field; delete `apps/api/src/lib/images/annotate.ts` + its test if no other caller (grep first).
- [ ] **Step 4: Run → PASS** + `corepack pnpm -F @lumina/api test`.
- [ ] **Step 5: Commit** — `feat(api): draw-to-place via fal region edit + drift safety-net; stop burning strokes`.

### Task R3.3: types cleanup + record decision

**Files:** Modify `packages/ai/src/types.ts` (remove `ComposeInput.annotation`), `packages/shared/src/annotation.ts` (keep — still the widget contract), `docs/DECISIONS.md` (add D83).

- [ ] **Step 1:** grep `annotation` across the repo; confirm only the widget capture + `generations.metadata` storage + the new region derivation remain. Remove `ComposeInput.annotation`.
- [ ] **Step 2:** Run full `corepack pnpm typecheck` + `corepack pnpm lint` → green.
- [ ] **Step 3:** Add `docs/DECISIONS.md` entry **D83** — "Draw-to-place = fal Seedream v4.5/edit full-frame + drift safety-net (Option A). Rejected: gemini-on-fal (too slow), flux-kontext-lora/inpaint for objects (frames the photo), crop-to-region (burnt/out-of-context lighting), region-gated diff-mask (drops thin object parts = the 'missing pieces' bug). Strokes travel as vectors, never burned."
- [ ] **Step 4:** Commit — `chore(ai): drop burned-annotation type path; docs: record D83`.

**Milestone R3 review checkpoint:** full repo lint+typecheck+test green. Run existing `pnpm -F @lumina/api eval` → still 7/7 (non-drawn untouched). Deploy to staging; owner tests draw-on-room in Studio + widget. PAUSE for review.

---

# Follow-up milestones (separate plans, after R3 is approved)

- **M-R4 — Eval gate upgrade:** add an automated vision judge (scores product-fidelity / room-preservation / placement) + drawn-region golden cases (reuse `coverage-slats-wall` + `product-lamp` with a stored region box) to `apps/api/scripts/eval-run.ts`; run as a pre-merge gate. Replaces manual 👍 for the drawn path.
- **M-R5 — Multi-product auto-mapping:** cluster strokes into N regions, map each cluster→product with a structured vision step (fallback order/proximity), then place all products in one full-frame region edit (multiple `image_urls` + per-product placement phrases) with the same drift net. Mapping accuracy becomes an eval metric.

---

## Self-review notes
- **Spec coverage:** (a) room preserved → drift net + containment; (b) faithful product → Seedream + fidelity rule; (c) no strokes → vectors never burned; (d) placed where drawn → placement phrase + region; (e) quality → full-frame raw (owner-preferred); (f) speed → Seedream ~30s. Additive concern → region behind seam, non-drawn untouched, generic prompt (no if/else).
- **No widget change needed** for the core fix (widget already sends vectors) — confirmed via flow map; widget E2E only revisited in M-R4/M-R5.
- **Generic-not-branchy:** the only data-driven variation is `placement` (geometry) + product facts; `productKind` is a soft prompt fact, not a code branch; the drift net is one numeric threshold, not per-category logic.

# Prompts — the editable AI-prompt surface

Every prompt the generation pipeline sends to a model lives here as a **named, documented template**.
This is the one place to read and tweak prompts. After editing:

```bash
pnpm -F @lumina/ai build      # rebuild the package
# then redeploy the API (Vercel) so the workflow picks up the new prompts
```

Changes are versioned in git — review them like any other code.

## Files

| File | What it controls | Used by |
|---|---|---|
| `system.ts` | `COMPOSE_SYSTEM_INSTRUCTION` — **the master prompt**: objective → inputs → ANALYZE → HARD RULES → output → avoid. Works for ANY product, interior **and** exterior. | every compose call |
| `compose.ts` | `buildComposeTask()` — the per-request facts: category (soft hint), dimensions, placement hint, scene lighting, exterior note, shopper free-text. | every compose call |
| `quantity.ts` | `buildQuantityPrompt()` — the coverage-quantity estimate prompt (tiles/decor/renovation/outdoor). | the quantity step (#7) |
| `scene.ts` | `buildScenePrompt()` — the per-image scene-analysis pass (lighting, surfaces, tilt, scale, placement, quality). Returns **continuous facts about that photo**, never a category. | the scene step (Phase 2 / D64) |
| `refine.ts` | `REFINE_SYSTEM_INSTRUCTION` + `buildRefineTask()` — the **layout-guided REFINE** prompt. **Currently unused (D67):** the workflow now ships the deterministic coverage composite directly instead of asking the model to refine it (the model collapsed the supplied grid + repainted the room). Kept in case we revisit a *mask-bounded* harmonization pass. | none (was: compose when a layout guide is present — Phase 5 / D66, retired by D67) |

> **No fixed category switch.** The master prompt has the model identify the product and decide its
> **placement archetype itself** (open-ended — the examples in `system.ts` only illustrate the idea, they
> don't limit it). The merchant `category` is passed in `compose.ts` only as a *soft hint*, so the result
> stays reliable for any product — there is no "unsupported category" failure mode.
>
> `prompt.ts` (one level up) is a thin assembler: `buildComposePrompt = system + task`, and it still
> switches to the **REFINE** pair (`refine.ts`) when `ComposeInput.layout` is set — but the workflow no
> longer sets `layout` (D67), so this branch is currently dormant. They are kept separate so the provider
> can send the system as a real system message.

## Guidelines when editing
- Keep the **HARD RULES** in `system.ts` intact — they are what stop the model from redrawing the
  product, altering the environment, or re-framing the photo.
- Shopper free-text is **untrusted**: it stays subordinated to the HARD RULES in `compose.ts`. Don't
  promote it above them.
- Prefer short, declarative lines. The image model reads these as constraints, not prose.

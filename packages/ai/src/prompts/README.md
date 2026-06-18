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
| `compose.ts` | `buildComposeTask()` / `buildCoveringTask()` / `buildReplacementTask()` — the **mode-specific** per-request task (single placement / surface re-surfacing / element replacement) plus the shared facts: category (soft hint), dimensions, scene lighting, exterior note, shopper free-text. | every compose call (selected by `plan.mode`, D69) |
| `quantity.ts` | `buildQuantityPrompt()` — the coverage-quantity estimate prompt (tiles/decor/renovation/outdoor). | the quantity step (#7) |
| `planner.ts` | `buildPlannerPrompt()` — the **planner** reasoning pass over BOTH images + product metadata → the operation `mode`, target, repetition, scale, and per-image scene facts. Replaces the old scene pass (one call, not two). | the planner step (Phase 1 / D68) |

> **No fixed category switch.** The master prompt has the model identify the product and decide its
> **placement archetype itself** (open-ended — the examples in `system.ts` only illustrate the idea, they
> don't limit it). The merchant `category` is passed in `compose.ts` only as a *soft hint*, so the result
> stays reliable for any product — there is no "unsupported category" failure mode.
>
> `prompt.ts` (one level up) is a thin assembler: `buildComposePrompt = system + mode-specific task`,
> selecting the task by the planner's `plan.mode` (`surface_covering` → re-surfacing, `object_replacement`
> → swap, `object_placement` → single placement; D69). System and task are kept separate so the provider
> can send the system as a real system message.

## Guidelines when editing
- Keep the **HARD RULES** in `system.ts` intact — they are what stop the model from redrawing the
  product, altering the environment, or re-framing the photo.
- Shopper free-text is **untrusted**: it stays subordinated to the HARD RULES in `compose.ts`. Don't
  promote it above them.
- Prefer short, declarative lines. The image model reads these as constraints, not prose.

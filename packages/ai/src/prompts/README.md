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
| `system.ts` | `COMPOSE_SYSTEM_INSTRUCTION` — the stable persona + **HARD RULES** for the compositor (interior **and** exterior). | every compose call |
| `compose.ts` | `buildComposeTask()` — the per-request task: placement, scale, lighting, category guidance, exterior note, shopper free-text. | every compose call |
| `category-guidance.ts` | `CATEGORY_GUIDANCE` (one line per product category) + `EXTERIOR_GUIDANCE` (added for outdoor scenes). | `compose.ts` |
| `quantity.ts` | `buildQuantityPrompt()` — the coverage-quantity estimate prompt (tiles/decor/renovation/outdoor). | the quantity step (#7) |

> `prompt.ts` (one level up) is a thin assembler: `buildComposePrompt = system + task`. The system
> instruction and the task are kept separate so the provider can send them as a real system message.

## Coming in later stages
- `scene.ts` — the scene-analysis vision prompt (S2, lighting + interior/exterior).
- `placement.ts` — the placement/mask vision prompt (S4, where the product goes).

## Guidelines when editing
- Keep the **HARD RULES** in `system.ts` intact — they are what stop the model from redrawing the
  product, altering the environment, or re-framing the photo.
- Shopper free-text is **untrusted**: it stays subordinated to the HARD RULES in `compose.ts`. Don't
  promote it above them.
- Prefer short, declarative lines. The image model reads these as constraints, not prose.

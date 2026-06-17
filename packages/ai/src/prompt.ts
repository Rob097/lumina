import type { ComposeInput } from './types.js';
import { COMPOSE_SYSTEM_INSTRUCTION } from './prompts/system.js';
import { buildComposeTask } from './prompts/compose.js';
import { REFINE_SYSTEM_INSTRUCTION, buildRefineTask } from './prompts/refine.js';

/**
 * Compose prompt assembler. All prompt *text* lives in `./prompts/` (the editable surface). This file
 * just joins the stable system instruction with the per-request task. Today the provider sends one
 * string; once it sends a real system message, `COMPOSE_SYSTEM_INSTRUCTION` and `buildComposeTask`
 * are passed separately (HARD RULE #8 keeps that a provider-only change).
 */
export { COMPOSE_SYSTEM_INSTRUCTION } from './prompts/system.js';
export { buildComposeTask } from './prompts/compose.js';
export { REFINE_SYSTEM_INSTRUCTION, buildRefineTask } from './prompts/refine.js';

/**
 * The full compose prompt = system instruction + per-request task (single string). With a layout guide
 * present (Phase 5) it assembles the REFINE prompt instead, so the model polishes the laid-out composite
 * rather than inventing placement from scratch.
 */
export function buildComposePrompt(input: ComposeInput): string {
  if (input.layout) {
    return `${REFINE_SYSTEM_INSTRUCTION}\n\n${buildRefineTask(input)}`;
  }
  return `${COMPOSE_SYSTEM_INSTRUCTION}\n\n${buildComposeTask(input)}`;
}

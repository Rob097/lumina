import type { ComposeInput } from './types.js';
import { COMPOSE_SYSTEM_INSTRUCTION } from './prompts/system.js';
import { buildComposeTask } from './prompts/compose.js';

/**
 * Compose prompt assembler. All prompt *text* lives in `./prompts/` (the editable surface). This file
 * just joins the stable system instruction with the per-request task. Today the provider sends one
 * string; once it sends a real system message, `COMPOSE_SYSTEM_INSTRUCTION` and `buildComposeTask`
 * are passed separately (HARD RULE #8 keeps that a provider-only change).
 */
export { COMPOSE_SYSTEM_INSTRUCTION } from './prompts/system.js';
export { buildComposeTask } from './prompts/compose.js';

/** The full compose prompt = system instruction + per-request task (single string). */
export function buildComposePrompt(input: ComposeInput): string {
  return `${COMPOSE_SYSTEM_INSTRUCTION}\n\n${buildComposeTask(input)}`;
}

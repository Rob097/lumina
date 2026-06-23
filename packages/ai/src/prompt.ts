import type { ComposeInput } from './types.js';
import { COMPOSE_SYSTEM_INSTRUCTION } from './prompts/system.js';
import { playbookRules } from './prompts/playbook.js';
import {
  buildComposeTask,
  buildCoveringTask,
  buildMultiPlacementTask,
  buildReplacementTask,
} from './prompts/compose.js';

/**
 * Compose prompt assembler. All prompt *text* lives in `./prompts/` (the editable surface). This file
 * joins the always-true system instruction (`system.ts`: fidelity / no-environment-alteration / keep-framing
 * / contact-shadow rules) with a **mode-specific task** chosen by the planner's `mode` (Generation Engine v3
 * §4.2). Today the provider sends one string; once it sends a real system message, the system instruction
 * and the task are passed separately (HARD RULE #8 keeps that a provider-only change).
 */
export { COMPOSE_SYSTEM_INSTRUCTION } from './prompts/system.js';
export {
  buildComposeTask,
  buildCoveringTask,
  buildMultiPlacementTask,
  buildReplacementTask,
} from './prompts/compose.js';

/**
 * The full compose prompt = the always-true system instruction + the task. With two or more products it's a
 * multi-object placement (F2). Otherwise the compositor's job is specific to the planner's operation:
 * re-surfacing for `surface_covering`, swapping for `object_replacement`, single placement for
 * `object_placement` (the default when no mode is present).
 */
export function buildComposePrompt(input: ComposeInput): string {
  const task =
    input.productInfos && input.productInfos.length > 1
      ? buildMultiPlacementTask(input)
      : input.mode === 'surface_covering'
        ? buildCoveringTask(input)
        : input.mode === 'object_replacement'
          ? buildReplacementTask(input)
          : buildComposeTask(input);
  // Owner-editable tuning rules (packages/ai/src/prompts/playbook.ts) ride between the always-true system
  // instruction and the task, applying to every mode (single + multi). Empty when no rules are configured.
  const playbook = playbookRules();
  return [COMPOSE_SYSTEM_INSTRUCTION, ...(playbook ? [playbook] : []), task].join('\n\n');
}

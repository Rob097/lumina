/**
 * Editable prompts surface (#AI-gen v2). Every prompt the pipeline sends to a model lives in this
 * folder as a named, documented template — open a file, tweak the wording, `pnpm -F @lumina/ai build`,
 * redeploy. See `README.md`.
 */
export { COMPOSE_SYSTEM_INSTRUCTION } from './system.js';
export { buildComposeTask } from './compose.js';
export { buildQuantityPrompt } from './quantity.js';

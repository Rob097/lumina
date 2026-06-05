/**
 * @lumina/ai — AIOrchestrator + providers + prompts.
 *
 * Every model call goes through `AIOrchestrator.compose()` (CLAUDE.md HARD RULE #8). Swapping
 * fal.ai ↔ Vertex ↔ Replicate is a one-file change behind the `AIProvider` interface.
 */
export * from './types.js';
export * from './prompt.js';
export * from './orchestrator.js';
export * from './moderation.js';
export * from './eval.js';
export { createOrchestratorFromEnv } from './factory.js';
export { MockProvider, MockSceneProvider } from './providers/mock.js';
export { FalProvider, buildFalInput, type FalProviderOptions } from './providers/fal.js';
export { VertexProvider } from './providers/vertex.js';
export { ReplicateProvider } from './providers/replicate.js';

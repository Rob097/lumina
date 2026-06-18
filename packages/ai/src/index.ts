/**
 * @lumina/ai — AIOrchestrator + providers + prompts.
 *
 * Every model call goes through `AIOrchestrator.compose()` (CLAUDE.md HARD RULE #8). Swapping the
 * Vercel AI Gateway ↔ fal.ai ↔ Vertex is a one-file change behind the `AIProvider` interface.
 */
export * from './types.js';
export * from './prompt.js';
export * from './quantity.js';
export * from './orchestrator.js';
export * from './moderation.js';
export * from './eval.js';
export { createOrchestratorFromEnv } from './factory.js';
export {
  MockProvider,
  MockBgRemovalProvider,
  MockPlannerProvider,
  MockQuantityProvider,
} from './providers/mock.js';
export {
  ReplicateMattingProvider,
  buildMattingRequest,
  type MattingRunner,
  type MattingCallArgs,
  type ReplicateMattingOptions,
} from './providers/bg-removal.js';
export {
  GatewayBgRemovalProvider,
  type GatewayBgRemovalRunner,
  type GatewayBgRemovalCallArgs,
  type GatewayBgRemovalOptions,
} from './providers/bg-removal-gateway.js';
export { buildCutoutPrompt } from './prompts/cutout.js';
export {
  GatewayQuantityProvider,
  type GatewayQuantityProviderOptions,
  type QuantityRunner,
  type QuantityCallArgs,
} from './providers/gateway-quantity.js';
export {
  GatewayPlannerProvider,
  type GatewayPlannerProviderOptions,
  type PlannerRunner,
  type PlannerCallArgs,
} from './providers/gateway-planner.js';
export { buildPlannerPrompt } from './prompts/planner.js';
export { planToSceneAnalysis } from './planning.js';
export {
  GatewayProvider,
  buildEditMessages,
  extractFirstImage,
  type GatewayProviderOptions,
  type GatewayRunner,
  type GatewayImage,
} from './providers/gateway.js';
export { VertexProvider } from './providers/vertex.js';
export { ReplicateProvider } from './providers/replicate.js';

import { GenerationPlanSchema, type GenerationPlan } from '@lumina/shared';
import { buildPlannerPrompt } from '../prompts/planner.js';
import type { ImageRef, PlannerInput, PlannerProvider } from '../types.js';

/** Args for the network call. Injectable so the provider logic is unit-tested without the gateway. */
export interface PlannerCallArgs {
  model: string;
  prompt: string;
  /** SCENE image, sent first. */
  room: ImageRef;
  /** PRODUCT image, sent second (the order matters for the prompt contract). */
  product: ImageRef;
}
export type PlannerRunner = (args: PlannerCallArgs) => Promise<GenerationPlan>;

export interface GatewayPlannerProviderOptions {
  /** Gateway model id for the text+vision planning pass (a fast flash model, NOT the image model). */
  model: string;
  apiKey?: string;
  baseURL?: string;
  /** Override the network runner (tests). */
  run?: PlannerRunner;
}

/** One image content part for the multimodal message (mirrors {@link GatewayQuantityProvider}). */
function imagePart(ref: ImageRef): { type: 'image'; image: string | Uint8Array; mediaType?: string } {
  if ('url' in ref) {
    return { type: 'image', image: ref.url };
  }
  return ref.contentType
    ? { type: 'image', image: ref.bytes, mediaType: ref.contentType }
    : { type: 'image', image: ref.bytes };
}

/**
 * Vercel AI Gateway planner (Generation Engine v3 §4.1). A cheap text+vision call via `generateObject`
 * with the shared {@link GenerationPlanSchema}, reasoning over BOTH images + product metadata. Evolves and
 * replaces the former scene-analysis pass (one call, not two). Swapping the model/provider is a one-file
 * change (HARD RULE #8).
 */
export class GatewayPlannerProvider implements PlannerProvider {
  private readonly run: PlannerRunner;

  constructor(private readonly opts: GatewayPlannerProviderOptions) {
    this.run = opts.run ?? createPlannerRunner(opts);
  }

  async plan(input: PlannerInput): Promise<GenerationPlan> {
    return this.run({
      model: this.opts.model,
      prompt: buildPlannerPrompt(input),
      room: input.room,
      product: input.product,
    });
  }
}

/** Default runner: AI SDK `generateObject` through the Vercel AI Gateway. Network-bound (not unit-tested). */
function createPlannerRunner(opts: GatewayPlannerProviderOptions): PlannerRunner {
  return async ({ model, prompt, room, product }) => {
    const [{ generateObject }, { createGateway }] = await Promise.all([
      import('ai'),
      import('@ai-sdk/gateway'),
    ]);
    const gateway = createGateway({
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
    const result = await generateObject({
      model: gateway(model),
      schema: GenerationPlanSchema,
      messages: [
        { role: 'user', content: [{ type: 'text', text: prompt }, imagePart(room), imagePart(product)] },
      ],
    });
    return result.object;
  };
}

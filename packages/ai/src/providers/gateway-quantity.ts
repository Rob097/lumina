import { QuantityModelOutputSchema, clampQuantity, type QuantityModelOutput } from '../quantity.js';
import type { ImageRef, QuantityEstimate, QuantityInput, QuantityProvider } from '../types.js';

/** Args for the network call. Injectable so the provider logic is unit-tested without the gateway. */
export interface QuantityCallArgs {
  model: string;
  prompt: string;
  room: ImageRef;
}
export type QuantityRunner = (args: QuantityCallArgs) => Promise<QuantityModelOutput>;

export interface GatewayQuantityProviderOptions {
  name?: string;
  /** Gateway model id for the text+vision analysis pass (NOT the image model), e.g. a fast flash model. */
  model: string;
  apiKey?: string;
  baseURL?: string;
  /** Override the network runner (tests). */
  run?: QuantityRunner;
}

/** One image content part for the multimodal message (mirrors `buildEditMessages`). */
function imagePart(ref: ImageRef): { type: 'image'; image: string | Uint8Array; mediaType?: string } {
  if ('url' in ref) {
    return { type: 'image', image: ref.url };
  }
  return ref.contentType
    ? { type: 'image', image: ref.bytes, mediaType: ref.contentType }
    : { type: 'image', image: ref.bytes };
}

/**
 * Vercel AI Gateway coverage-quantity estimator (§7 #7). A cheap text+vision pass via `generateObject`
 * with a Zod schema; mirrors {@link GatewayProvider} so swapping the model/provider is a one-file change
 * (HARD RULE #8). The raw model number is clamped/rounded to a sane integer.
 */
export class GatewayQuantityProvider implements QuantityProvider {
  readonly name: string;
  private readonly run: QuantityRunner;

  constructor(private readonly opts: GatewayQuantityProviderOptions) {
    this.name = opts.name ?? 'gateway-quantity';
    this.run = opts.run ?? createQuantityRunner(opts);
  }

  async estimateQuantity(input: QuantityInput, prompt: string): Promise<QuantityEstimate> {
    const raw = await this.run({ model: this.opts.model, prompt, room: input.room });
    return {
      suggestedQuantity: clampQuantity(raw.suggestedQuantity),
      unit: raw.unit,
      isCoverage: true,
      rationale: raw.rationale,
      confidence: raw.confidence,
    };
  }
}

/** Default runner: AI SDK `generateObject` through the Vercel AI Gateway. Network-bound (not unit-tested). */
function createQuantityRunner(opts: GatewayQuantityProviderOptions): QuantityRunner {
  return async ({ model, prompt, room }) => {
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
      schema: QuantityModelOutputSchema,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, imagePart(room)] }],
    });
    return result.object;
  };
}

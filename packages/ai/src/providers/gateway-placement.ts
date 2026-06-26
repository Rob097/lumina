import { FashionPlacementSchema, type FashionPlacement } from '@lumina/shared';
import { buildPlacementPrompt } from '../prompts/placement.js';
import type { ImageRef, PlacementDetectorInput, PlacementDetectorProvider } from '../types.js';

/** Args for the network call. Injectable so the provider logic is unit-tested without the gateway. */
export interface PlacementCallArgs {
  model: string;
  prompt: string;
  /** SUBJECT image, sent first. */
  subject: ImageRef;
  /** PRODUCT image, sent second (order matters for the prompt contract). */
  product: ImageRef;
}
export type PlacementRunner = (args: PlacementCallArgs) => Promise<FashionPlacement>;

export interface GatewayPlacementProviderOptions {
  /** Gateway model id for the text+vision detection pass (a cheap flash model, NOT the image model). */
  model: string;
  apiKey?: string;
  baseURL?: string;
  /** Override the network runner (tests). */
  run?: PlacementRunner;
}

function imagePart(ref: ImageRef): { type: 'image'; image: string | Uint8Array; mediaType?: string } {
  if ('url' in ref) {
    return { type: 'image', image: ref.url };
  }
  return ref.contentType
    ? { type: 'image', image: ref.bytes, mediaType: ref.contentType }
    : { type: 'image', image: ref.bytes };
}

/**
 * Vercel AI Gateway fashion placement detector. A cheap text+vision `generateObject` call with the shared
 * {@link FashionPlacementSchema} — it locates where the product goes + a body-scale reference, so the workflow
 * can size and position the product deterministically (the image model ignores both). Mirrors the planner
 * provider. Swapping the model/provider is a one-file change (HARD RULE #8).
 */
export class GatewayPlacementProvider implements PlacementDetectorProvider {
  private readonly run: PlacementRunner;

  constructor(private readonly opts: GatewayPlacementProviderOptions) {
    this.run = opts.run ?? createPlacementRunner(opts);
  }

  async detect(input: PlacementDetectorInput): Promise<FashionPlacement> {
    return this.run({
      model: this.opts.model,
      prompt: buildPlacementPrompt(input),
      subject: input.subject,
      product: input.product,
    });
  }
}

/** Default runner: AI SDK `generateObject` through the Vercel AI Gateway. Network-bound (not unit-tested). */
function createPlacementRunner(opts: GatewayPlacementProviderOptions): PlacementRunner {
  return async ({ model, prompt, subject, product }) => {
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
      schema: FashionPlacementSchema,
      messages: [
        { role: 'user', content: [{ type: 'text', text: prompt }, imagePart(subject), imagePart(product)] },
      ],
    });
    return result.object;
  };
}

/** Offline/test detector: reports no placement, so the workflow falls back to the plain generative path. */
export class MockPlacementDetector implements PlacementDetectorProvider {
  async detect(_input: PlacementDetectorInput): Promise<FashionPlacement> {
    return { found: false, carry: 'hand', armSide: 'none', anchor: { x: 0.5, y: 0.5 }, shoulderWidthNorm: 0.4 };
  }
}

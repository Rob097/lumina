import { SceneAnalysisSchema, type SceneAnalysis } from '@lumina/shared';
import { buildScenePrompt } from '../prompts/scene.js';
import type { ImageRef, SceneProvider } from '../types.js';

/** Args for the network call. Injectable so the provider logic is unit-tested without the gateway. */
export interface SceneCallArgs {
  model: string;
  prompt: string;
  room: ImageRef;
}
export type SceneRunner = (args: SceneCallArgs) => Promise<SceneAnalysis>;

export interface GatewaySceneProviderOptions {
  /** Gateway model id for the text+vision analysis pass (a fast flash model, NOT the image model). */
  model: string;
  apiKey?: string;
  baseURL?: string;
  /** Override the network runner (tests). */
  run?: SceneRunner;
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
 * Vercel AI Gateway scene-analysis pass (Phase 2 / D64). A cheap text+vision call via `generateObject`
 * with the shared {@link SceneAnalysisSchema}; mirrors {@link GatewayQuantityProvider} so swapping the
 * model/provider is a one-file change (HARD RULE #8). Returns per-image facts, NOT a category.
 */
export class GatewaySceneProvider implements SceneProvider {
  private readonly run: SceneRunner;

  constructor(private readonly opts: GatewaySceneProviderOptions) {
    this.run = opts.run ?? createSceneRunner(opts);
  }

  async analyzeScene(image: ImageRef): Promise<SceneAnalysis> {
    return this.run({ model: this.opts.model, prompt: buildScenePrompt(), room: image });
  }
}

/** Default runner: AI SDK `generateObject` through the Vercel AI Gateway. Network-bound (not unit-tested). */
function createSceneRunner(opts: GatewaySceneProviderOptions): SceneRunner {
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
      schema: SceneAnalysisSchema,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, imagePart(room)] }],
    });
    return result.object;
  };
}

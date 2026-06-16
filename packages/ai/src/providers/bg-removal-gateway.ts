import { buildCutoutPrompt } from '../prompts/cutout.js';
import type { BgRemovalProvider, ImageRef } from '../types.js';
import { buildEditMessages, buildImageProviderOptions, extractFirstImage } from './gateway.js';

/**
 * Product background removal via the **Vercel AI Gateway** (Phase 1 / D63) — the Vercel-consolidated path
 * that reuses `AI_GATEWAY_API_KEY` (no extra service/credential). A generative image model (Gemini "Nano
 * Banana") isolates the product onto a clean white background. Unlike the Replicate **matting** provider
 * this RE-RENDERS the product, so it is a slightly lower-fidelity *reference* — acceptable here because the
 * compositor re-renders the product into the room anyway (the pixel-perfect step preserves the room, not
 * the product). Behind the `BgRemovalProvider` seam, so matting ↔ gateway is a one-env-var swap (#8).
 * No `sharp` — stays out of `packages/ai`.
 */
export interface GatewayBgRemovalCallArgs {
  model: string;
  prompt: string;
  image: ImageRef;
}
export type GatewayBgRemovalRunner = (
  args: GatewayBgRemovalCallArgs,
) => Promise<{ bytes: Uint8Array; contentType: string }>;

export interface GatewayBgRemovalOptions {
  /** Gateway image model id (e.g. `google/gemini-3-pro-image`). Env `BG_REMOVAL_GATEWAY_MODEL`. */
  model: string;
  apiKey?: string;
  baseURL?: string;
  /** Override the network runner (tests). */
  run?: GatewayBgRemovalRunner;
}

export class GatewayBgRemovalProvider implements BgRemovalProvider {
  private readonly run: GatewayBgRemovalRunner;

  constructor(private readonly opts: GatewayBgRemovalOptions) {
    this.run = opts.run ?? createGatewayBgRemovalRunner(opts);
  }

  removeBackground(image: ImageRef): Promise<{ bytes: Uint8Array; contentType: string }> {
    return this.run({ model: this.opts.model, prompt: buildCutoutPrompt(), image });
  }
}

/** Default runner: AI SDK `generateText` through the Gateway (mirrors {@link GatewayProvider}). */
function createGatewayBgRemovalRunner(opts: GatewayBgRemovalOptions): GatewayBgRemovalRunner {
  return async ({ model, prompt, image }) => {
    const [{ generateText }, { createGateway }] = await Promise.all([
      import('ai'),
      import('@ai-sdk/gateway'),
    ]);
    const gateway = createGateway({
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    });
    const result = await generateText({
      model: gateway(model),
      messages: buildEditMessages(prompt, [image]),
      providerOptions: buildImageProviderOptions({}),
    });
    const img = extractFirstImage(result.files);
    return { bytes: img.bytes, contentType: img.contentType };
  };
}

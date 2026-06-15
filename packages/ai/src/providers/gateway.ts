import type { AIProvider, ComposeInput, ImageRef, ProviderResult } from '../types.js';

/** A user-message content part we send to a multimodal image model. */
export type GatewayContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string | Uint8Array; mediaType?: string };

/** A single multimodal user message (the only role we ever send). */
export interface GatewayMessage {
  role: 'user';
  content: GatewayContentPart[];
}

/**
 * Map a prompt + ordered reference images to one multimodal user message. The image order is
 * significant for the prompt contract — ROOM first, PRODUCT second.
 */
export function buildEditMessages(prompt: string, images: ImageRef[]): GatewayMessage[] {
  const content: GatewayContentPart[] = [{ type: 'text', text: prompt }];
  for (const ref of images) {
    if ('url' in ref) {
      content.push({ type: 'image', image: ref.url });
    } else if (ref.contentType) {
      content.push({ type: 'image', image: ref.bytes, mediaType: ref.contentType });
    } else {
      content.push({ type: 'image', image: ref.bytes });
    }
  }
  return [{ role: 'user', content }];
}

/** Shape of a generated file returned by the AI SDK (`result.files`). */
export interface GatewayFile {
  uint8Array: Uint8Array;
  mediaType: string;
}

/** A decoded image returned from a compose call. */
export interface GatewayImage {
  bytes: Uint8Array;
  contentType: string;
  width?: number;
  height?: number;
}

/** Pick the first image file from a multimodal result, skipping any non-image parts. */
export function extractFirstImage(files: ReadonlyArray<GatewayFile>): GatewayImage {
  const image = files.find((f) => f.mediaType?.startsWith('image/'));
  if (!image) {
    throw new Error('gateway returned no image files');
  }
  return { bytes: image.uint8Array, contentType: image.mediaType };
}

export interface GatewayCallArgs {
  model: string;
  prompt: string;
  /** Reference images, ROOM first then PRODUCT. */
  images: ImageRef[];
  /** Output aspect ratio pinned to the input (e.g. '4:3') so the edit can't re-frame/rotate the scene. */
  aspectRatio?: string;
  /** Output resolution tier ('1K' | '2K' | '4K'). */
  imageSize?: string;
}

/** The network call. Injectable so the provider logic is unit-tested without hitting the gateway. */
export type GatewayRunner = (args: GatewayCallArgs) => Promise<GatewayImage>;

export interface GatewayProviderOptions {
  name: string;
  /** Gateway model id, e.g. 'google/gemini-3-pro-image' (Nano Banana Pro). */
  model: string;
  /** Our cost per image in cents (for margin records). */
  costCents: number;
  /** Output resolution tier passed to the model ('1K' | '2K' | '4K'); omitted ⇒ model default. */
  imageSize?: string;
  /** AI Gateway API key. When omitted, the SDK falls back to VERCEL_OIDC_TOKEN on Vercel. */
  apiKey?: string;
  baseURL?: string;
  /** Override the network runner (tests). */
  run?: GatewayRunner;
}

/**
 * Vercel AI Gateway provider (D49). Composes a room + product into one image via a multimodal image
 * model (`generateText` → `result.files`). One class serves the quality tier (Nano Banana Pro) and the
 * fast tier (Nano Banana 2) with a different `model`. Swapping the gateway ↔ fal ↔ Vertex stays a
 * one-file change behind `AIProvider` (HARD RULE #8).
 */
export class GatewayProvider implements AIProvider {
  readonly name: string;
  private readonly run: GatewayRunner;

  constructor(private readonly opts: GatewayProviderOptions) {
    this.name = opts.name;
    this.run = opts.run ?? createGatewayRunner(opts);
  }

  async compose(input: ComposeInput, prompt: string): Promise<ProviderResult> {
    const image = await this.run({
      model: this.opts.model,
      prompt,
      images: [input.room, input.product],
      ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
      ...(this.opts.imageSize ? { imageSize: this.opts.imageSize } : {}),
    });
    return {
      bytes: image.bytes,
      contentType: image.contentType,
      model: this.opts.model,
      costCents: this.opts.costCents,
      width: image.width,
      height: image.height,
    };
  }
}

/** Build the Google image-config provider options (aspect ratio + size) for a compose call. */
export function buildImageProviderOptions(args: { aspectRatio?: string; imageSize?: string }) {
  const imageConfig: Record<string, string> = {};
  if (args.aspectRatio) imageConfig.aspectRatio = args.aspectRatio;
  if (args.imageSize) imageConfig.imageSize = args.imageSize;
  return {
    google: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
    },
  };
}

/** Default runner: AI SDK `generateText` through the Vercel AI Gateway. Network-bound (e2e/eval). */
function createGatewayRunner(opts: GatewayProviderOptions): GatewayRunner {
  return async ({ model, prompt, images, aspectRatio, imageSize }) => {
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
      messages: buildEditMessages(prompt, images),
      providerOptions: buildImageProviderOptions({ aspectRatio, imageSize }),
    });
    return extractFirstImage(result.files);
  };
}

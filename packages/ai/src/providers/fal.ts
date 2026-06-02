import { fal } from '@fal-ai/client';
import { z } from 'zod';
import type { AIProvider, ComposeInput, ImageRef, ProviderResult } from '../types.js';

export interface FalInput {
  prompt: string;
  image_urls: string[];
  num_images: number;
}

/** Pure mapping of room + product + prompt to a fal multi-image edit input (ROOM first, PRODUCT second). */
export function buildFalInput(roomUrl: string, productUrl: string, prompt: string): FalInput {
  return { prompt, image_urls: [roomUrl, productUrl], num_images: 1 };
}

const FalOutput = z.object({
  images: z
    .array(
      z.object({
        url: z.string().url(),
        width: z.number().optional(),
        height: z.number().optional(),
        content_type: z.string().optional(),
      }),
    )
    .min(1),
});

export interface FalProviderOptions {
  name: string;
  /** fal endpoint id, e.g. 'fal-ai/nano-banana-pro/edit'. */
  model: string;
  key: string;
  /** Our cost per image in cents (for margin records). */
  costCents: number;
}

/**
 * fal.ai provider — primary (Nano Banana Pro) and fast tier (FLUX.2 Edit) via the same class with a
 * different `model`. Network-bound: exercised via the live e2e path, not unit tests.
 */
export class FalProvider implements AIProvider {
  readonly name: string;

  constructor(private readonly opts: FalProviderOptions) {
    this.name = opts.name;
    fal.config({ credentials: opts.key });
  }

  async compose(input: ComposeInput, prompt: string): Promise<ProviderResult> {
    const [roomUrl, productUrl] = await Promise.all([
      this.toUrl(input.room),
      this.toUrl(input.product),
    ]);
    const { data } = await fal.subscribe(this.opts.model, {
      input: buildFalInput(roomUrl, productUrl, prompt),
    });
    const parsed = FalOutput.parse(data);
    const image = parsed.images[0];
    if (!image) {
      throw new Error('fal returned no images');
    }
    const response = await fetch(image.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      contentType: image.content_type ?? 'image/jpeg',
      model: this.opts.model,
      costCents: this.opts.costCents,
      width: image.width,
      height: image.height,
    };
  }

  private async toUrl(ref: ImageRef): Promise<string> {
    if ('url' in ref) {
      return ref.url;
    }
    const blob = new Blob([ref.bytes], { type: ref.contentType ?? 'image/jpeg' });
    return fal.storage.upload(blob);
  }
}

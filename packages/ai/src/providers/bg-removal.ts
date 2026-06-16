import type { BgRemovalProvider, ImageRef } from '../types.js';

/**
 * Product background removal via a Replicate **matting** model (BiRefNet / rembg-class).
 *
 * A matting model outputs a cutout of the ORIGINAL product pixels under an alpha matte — it does NOT
 * re-render the product — so geometry/materials/colors/branding are preserved (the fidelity hard rule).
 * A generative "remove background" was rejected for exactly this reason: it re-paints the product and can
 * alter its identity. Behind the `BgRemovalProvider` seam so the model is a one-file swap (HARD RULE #8).
 */
export interface MattingCallArgs {
  model: string;
  image: ImageRef;
}

/** The single network call, injectable so the provider logic is unit-tested without hitting Replicate. */
export type MattingRunner = (args: MattingCallArgs) => Promise<{ bytes: Uint8Array; contentType: string }>;

export interface ReplicateMattingOptions {
  /** Replicate official-model id, e.g. `men1scus/birefnet`. Env-configured (`BG_REMOVAL_MODEL`). */
  model: string;
  apiToken?: string;
  /** The image-input field the model expects (default `image`). */
  inputKey?: string;
  run?: MattingRunner;
}

export class ReplicateMattingProvider implements BgRemovalProvider {
  private readonly run: MattingRunner;

  constructor(private readonly opts: ReplicateMattingOptions) {
    this.run = opts.run ?? createReplicateMattingRunner(opts);
  }

  removeBackground(image: ImageRef): Promise<{ bytes: Uint8Array; contentType: string }> {
    return this.run({ model: this.opts.model, image });
  }
}

/** Encode an image ref as a Replicate input value: a URL passes through; raw bytes become a data URI. */
function imageInput(image: ImageRef): string {
  if ('url' in image) {
    return image.url;
  }
  const base64 = Buffer.from(image.bytes).toString('base64');
  return `data:${image.contentType ?? 'image/png'};base64,${base64}`;
}

/** Matting models return a single image URL or an array; take the first string URL. */
function firstUrl(output: unknown): string | null {
  if (typeof output === 'string') {
    return output;
  }
  if (Array.isArray(output)) {
    const found = output.find((x) => typeof x === 'string');
    return typeof found === 'string' ? found : null;
  }
  return null;
}

/**
 * Default runner: the Replicate HTTP API with `Prefer: wait` (blocks up to 60s for the prediction), then
 * fetches the resulting cutout. Matting is fast, so the synchronous wait is enough; a non-terminal result
 * throws and the caller degrades to the raw product image (cutout is best-effort, never bills a failure).
 */
function createReplicateMattingRunner(opts: ReplicateMattingOptions): MattingRunner {
  const inputKey = opts.inputKey ?? 'image';
  return async ({ model, image }) => {
    const token = opts.apiToken ?? process.env.REPLICATE_API_TOKEN;
    if (!token) {
      throw new Error('REPLICATE_API_TOKEN is not set');
    }
    const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({ input: { [inputKey]: imageInput(image) } }),
    });
    if (!res.ok) {
      throw new Error(`Replicate matting failed: ${res.status} ${await res.text()}`);
    }
    const prediction = (await res.json()) as { status?: string; output?: unknown; error?: unknown };
    if (prediction.status !== 'succeeded') {
      throw new Error(
        `Replicate matting did not succeed: ${prediction.status ?? 'unknown'} ${String(prediction.error ?? '')}`,
      );
    }
    const url = firstUrl(prediction.output);
    if (!url) {
      throw new Error('Replicate matting returned no image output');
    }
    const img = await fetch(url);
    if (!img.ok) {
      throw new Error(`Replicate matting output fetch failed: ${img.status}`);
    }
    return {
      bytes: new Uint8Array(await img.arrayBuffer()),
      contentType: img.headers.get('content-type') ?? 'image/png',
    };
  };
}

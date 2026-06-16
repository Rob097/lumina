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
  /**
   * Replicate model ref (`BG_REMOVAL_MODEL`). A non-official matting model needs a pinned version:
   * `owner/name:version` (e.g. `men1scus/birefnet:f74986db…`) or a bare 64-char version id. A bare
   * `owner/name` only works for official models.
   */
  model: string;
  apiToken?: string;
  /** The image-input field the model expects (`BG_REMOVAL_INPUT_KEY`, default `image`). */
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

/**
 * Pick the Replicate endpoint + body for a model ref. Replicate runs a bare `owner/name` via the
 * official-models endpoint, but **every non-official model requires a pinned version** — passed either as
 * `owner/name:version` or a bare 64-char version id — which goes through `/v1/predictions`. (BiRefNet and
 * other matting models are not official, so the version form is the one we actually use; see the activation
 * note in `.env.example`.) Pure, so the endpoint logic is unit-tested without the network.
 */
export function buildMattingRequest(
  model: string,
  inputKey: string,
  image: ImageRef,
): { url: string; body: Record<string, unknown> } {
  const input = { [inputKey]: imageInput(image) };
  const isVersioned = model.includes(':') || /^[0-9a-f]{64}$/.test(model);
  if (isVersioned) {
    return { url: 'https://api.replicate.com/v1/predictions', body: { version: model, input } };
  }
  return { url: `https://api.replicate.com/v1/models/${model}/predictions`, body: { input } };
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
    const { url: endpoint, body } = buildMattingRequest(model, inputKey, image);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify(body),
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

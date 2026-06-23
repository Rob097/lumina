import type { AIProvider, ComposeInput, ImageRef, ProviderResult } from '../types.js';

/**
 * fal.ai provider (draw-to-place / region_edit). Composes a room + product(s) into one image via a
 * reference editor (default ByteDance Seedream v4.5/edit) — chosen in the spike for faithful product
 * reconstruction at ~$0.04 / ~30s. Swapping the gateway ↔ fal ↔ Vertex stays a one-file change behind
 * `AIProvider` (CLAUDE.md HARD RULE #8). The network call is injectable so the mapping is unit-tested
 * without hitting fal.
 */

/** The output of a single fal edit call. */
export interface FalImage {
  bytes: Uint8Array;
  contentType: string;
  width?: number;
  height?: number;
}

export interface FalCallArgs {
  model: string;
  prompt: string;
  /** Reference images, ROOM first then PRODUCT(s). */
  images: ImageRef[];
  /** Output size; Seedream requires total px ≥ 2560×1440 and ≤ 4096². */
  imageSize: { width: number; height: number };
}

/** The network call. Injectable so the provider logic is unit-tested without hitting fal. */
export type FalRunner = (args: FalCallArgs) => Promise<FalImage>;

export interface FalProviderOptions {
  name: string;
  /** fal endpoint id, e.g. 'fal-ai/bytedance/seedream/v4.5/edit'. */
  model: string;
  /** Our cost per image in cents (for margin records). */
  costCents: number;
  /** fal API key. Only used by the default runner; never logged. */
  falKey?: string;
  /** Override the network runner (tests). */
  run?: FalRunner;
}

const SEEDREAM_MIN_PX = 2560 * 1440;
const FAL_MAX_EDGE = 4096;

/**
 * Pick an output size that preserves the room's aspect ratio and satisfies Seedream's pixel floor
 * (≥ 2560×1440 ≈ 3.69MP) without exceeding 4096 per edge. Aspect is parsed from a `"W:H"` string;
 * absent ⇒ square. The result is the model's render size; the workflow composites it back to the
 * room's native dimensions, so preserving aspect here avoids any stretch.
 */
export function falImageSize(aspectRatio: string | undefined): { width: number; height: number } {
  const parts = (aspectRatio ?? '1:1').split(':').map(Number);
  const aw = parts[0];
  const ah = parts[1];
  const aspect = aw && ah && aw > 0 && ah > 0 ? aw / ah : 1;
  // Target a hair above the floor so rounding never drops below it.
  const target = SEEDREAM_MIN_PX * 1.1;
  let height = Math.round(Math.sqrt(target / aspect));
  let width = Math.round(height * aspect);
  if (width > FAL_MAX_EDGE) {
    width = FAL_MAX_EDGE;
    height = Math.round(width / aspect);
  }
  if (height > FAL_MAX_EDGE) {
    height = FAL_MAX_EDGE;
    width = Math.round(height * aspect);
  }
  return { width, height };
}

export class FalProvider implements AIProvider {
  readonly name: string;
  private readonly run: FalRunner;

  constructor(private readonly opts: FalProviderOptions) {
    this.name = opts.name;
    this.run = opts.run ?? createFalRunner(opts);
  }

  async compose(input: ComposeInput, prompt: string): Promise<ProviderResult> {
    // ROOM first, then the product(s) — the order the prompt contract relies on.
    const products = input.products ?? [input.product];
    const image = await this.run({
      model: this.opts.model,
      prompt,
      images: [input.room, ...products],
      imageSize: falImageSize(input.aspectRatio),
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Map an ImageRef to a fal image input: a public URL, or a base64 data URI for raw bytes. */
function toFalImage(ref: ImageRef): string {
  if ('url' in ref) {
    return ref.url;
  }
  const mime = ref.contentType ?? 'image/jpeg';
  return `data:${mime};base64,${Buffer.from(ref.bytes).toString('base64')}`;
}

interface FalResultImage {
  url: string;
  content_type?: string;
  width?: number;
  height?: number;
}

/** Default runner: fal queue API (submit → poll → fetch the result image). Network-bound (e2e/eval). */
function createFalRunner(opts: FalProviderOptions): FalRunner {
  return async ({ model, prompt, images, imageSize }) => {
    if (!opts.falKey) {
      throw new Error('FalProvider: missing fal key');
    }
    const auth = { Authorization: `Key ${opts.falKey}` };
    const body = {
      prompt,
      image_urls: images.map(toFalImage),
      image_size: imageSize,
      num_images: 1,
      max_images: 1,
      output_format: 'jpeg',
    };
    const submit = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!submit.ok) {
      throw new Error(`fal submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
    }
    const queued = (await submit.json()) as { status_url: string; response_url: string };
    const start = Date.now();
    for (;;) {
      await sleep(2000);
      const st = await fetch(queued.status_url, { headers: auth });
      if (!st.ok) {
        throw new Error(`fal status ${st.status}`);
      }
      const status = (await st.json()) as { status: string };
      if (status.status === 'COMPLETED') {
        break;
      }
      if (status.status !== 'IN_QUEUE' && status.status !== 'IN_PROGRESS') {
        throw new Error(`fal job ${status.status}`);
      }
      if (Date.now() - start > 240_000) {
        throw new Error('fal job timeout (240s)');
      }
    }
    const result = (await (await fetch(queued.response_url, { headers: auth })).json()) as {
      images?: FalResultImage[];
    };
    const out = result.images?.[0];
    if (!out?.url) {
      throw new Error('fal returned no image');
    }
    const bytes = out.url.startsWith('data:')
      ? new Uint8Array(Buffer.from(out.url.slice(out.url.indexOf(',') + 1), 'base64'))
      : new Uint8Array(await (await fetch(out.url)).arrayBuffer());
    return { bytes, contentType: out.content_type ?? 'image/jpeg', width: out.width, height: out.height };
  };
}

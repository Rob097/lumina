import { describe, expect, it, vi } from 'vitest';
import {
  buildEditMessages,
  buildImageProviderOptions,
  extractFirstImage,
  GatewayProvider,
} from '../src/providers/gateway.js';
import { createOrchestratorFromEnv } from '../src/factory.js';
import type { ComposeInput } from '../src/types.js';

const baseInput = (): ComposeInput => ({
  room: { url: 'https://x/room.jpg' },
  product: { url: 'https://x/product.png' },
  category: 'furniture',
  policy: 'quality',
});

describe('buildEditMessages', () => {
  it('builds one user message: prompt text first, then ROOM, then PRODUCT', () => {
    const msgs = buildEditMessages('PROMPT', [
      { url: 'https://x/room.jpg' },
      { url: 'https://x/product.png' },
    ]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe('user');
    const content = msgs[0]!.content;
    expect(content[0]).toEqual({ type: 'text', text: 'PROMPT' });
    expect(content[1]).toEqual({ type: 'image', image: 'https://x/room.jpg' });
    expect(content[2]).toEqual({ type: 'image', image: 'https://x/product.png' });
  });

  it('passes raw bytes with their media type', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const msgs = buildEditMessages('P', [{ bytes, contentType: 'image/png' }]);
    expect(msgs[0]!.content[1]).toEqual({ type: 'image', image: bytes, mediaType: 'image/png' });
  });
});

describe('buildImageProviderOptions', () => {
  it('always requests TEXT+IMAGE modalities and adds aspectRatio/imageSize when present', () => {
    expect(buildImageProviderOptions({ aspectRatio: '4:3', imageSize: '2K' })).toEqual({
      google: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:3', imageSize: '2K' } },
    });
  });

  it('omits imageConfig entirely when neither aspect ratio nor size is given', () => {
    expect(buildImageProviderOptions({})).toEqual({
      google: { responseModalities: ['TEXT', 'IMAGE'] },
    });
  });
});

describe('extractFirstImage', () => {
  it('returns the first image file as bytes + content type', () => {
    const bytes = new Uint8Array([9, 9]);
    const img = extractFirstImage([{ uint8Array: bytes, mediaType: 'image/jpeg' }]);
    expect(img).toEqual({ bytes, contentType: 'image/jpeg' });
  });

  it('skips non-image files and returns the first image', () => {
    const bytes = new Uint8Array([5]);
    const img = extractFirstImage([
      { uint8Array: new Uint8Array([0]), mediaType: 'text/plain' },
      { uint8Array: bytes, mediaType: 'image/png' },
    ]);
    expect(img.bytes).toEqual(bytes);
    expect(img.contentType).toBe('image/png');
  });

  it('throws when the model returned no image files', () => {
    expect(() => extractFirstImage([])).toThrow(/no image/i);
  });
});

describe('GatewayProvider.compose', () => {
  it('sends ROOM first + PRODUCT second to the runner and maps the result', async () => {
    const run = vi.fn(async () => ({
      bytes: new Uint8Array([7]),
      contentType: 'image/jpeg',
      width: 1200,
      height: 900,
    }));
    const provider = new GatewayProvider({
      name: 'gateway-quality',
      model: 'google/gemini-3-pro-image',
      costCents: 13,
      run,
    });

    const result = await provider.compose(baseInput(), 'PROMPT');

    expect(run).toHaveBeenCalledWith({
      model: 'google/gemini-3-pro-image',
      prompt: 'PROMPT',
      images: [{ url: 'https://x/room.jpg' }, { url: 'https://x/product.png' }],
    });
    expect(result).toMatchObject({
      model: 'google/gemini-3-pro-image',
      costCents: 13,
      contentType: 'image/jpeg',
      width: 1200,
      height: 900,
    });
    expect(result.bytes).toEqual(new Uint8Array([7]));
  });

  it('sends ROOM first then every product image (multi-product) in request order', async () => {
    const run = vi.fn(async () => ({ bytes: new Uint8Array([7]), contentType: 'image/jpeg' }));
    const provider = new GatewayProvider({
      name: 'gateway-quality',
      model: 'google/gemini-3-pro-image',
      costCents: 13,
      run,
    });
    await provider.compose(
      { ...baseInput(), products: [{ url: 'https://x/p1.png' }, { url: 'https://x/p2.png' }] },
      'PROMPT',
    );
    expect(run).toHaveBeenCalledWith({
      model: 'google/gemini-3-pro-image',
      prompt: 'PROMPT',
      images: [
        { url: 'https://x/room.jpg' },
        { url: 'https://x/p1.png' },
        { url: 'https://x/p2.png' },
      ],
    });
  });

  it('forwards the pinned aspect ratio + image size to the runner', async () => {
    const run = vi.fn(async () => ({ bytes: new Uint8Array([1]), contentType: 'image/jpeg' }));
    const provider = new GatewayProvider({
      name: 'gateway-quality',
      model: 'google/gemini-3-pro-image',
      costCents: 13,
      imageSize: '2K',
      run,
    });
    await provider.compose({ ...baseInput(), aspectRatio: '4:3' }, 'PROMPT');
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ aspectRatio: '4:3', imageSize: '2K' }),
    );
  });

  it('exposes its configured name', () => {
    const provider = new GatewayProvider({
      name: 'gateway-fast',
      model: 'google/gemini-3.1-flash-image-preview',
      costCents: 6,
      run: vi.fn(),
    });
    expect(provider.name).toBe('gateway-fast');
  });
});

describe('createOrchestratorFromEnv', () => {
  it('falls back to a mock provider when no gateway credentials are present', async () => {
    const orch = createOrchestratorFromEnv({});
    const result = await orch.compose(baseInput());
    expect(result.model).toBe('mock-compose');
    expect(result.costCents).toBe(0);
  });

  it('honors AI_PROVIDER=mock even with an API key set', async () => {
    const orch = createOrchestratorFromEnv({ AI_GATEWAY_API_KEY: 'k', AI_PROVIDER: 'mock' });
    const result = await orch.compose({ ...baseInput(), policy: 'fast' });
    expect(result.model).toBe('mock-compose');
  });
});

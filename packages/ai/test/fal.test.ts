import { describe, it, expect, vi } from 'vitest';
import { FalProvider, falImageSize, type FalCallArgs } from '../src/providers/fal.js';
import type { ComposeInput } from '../src/types.js';

const baseInput = (): ComposeInput => ({
  room: { url: 'https://cdn/room.jpg' },
  product: { url: 'https://cdn/product.png' },
  products: [{ url: 'https://cdn/product.png' }],
  category: 'lighting',
  aspectRatio: '4:3',
  policy: 'quality',
});

describe('falImageSize', () => {
  it('returns a room-aspect size at >= ~3.69MP, capped at 4096', () => {
    const s = falImageSize('4:3');
    expect(s.width * s.height).toBeGreaterThanOrEqual(2560 * 1440);
    expect(Math.abs(s.width / s.height - 4 / 3)).toBeLessThan(0.02);
    expect(s.width).toBeLessThanOrEqual(4096);
    expect(s.height).toBeLessThanOrEqual(4096);
  });

  it('defaults to square when no aspect ratio is given', () => {
    const s = falImageSize(undefined);
    expect(Math.abs(s.width / s.height - 1)).toBeLessThan(0.02);
    expect(s.width * s.height).toBeGreaterThanOrEqual(2560 * 1440);
  });
});

describe('FalProvider.compose', () => {
  it('sends ROOM first then PRODUCTS, a room-aspect ~4MP image_size, and maps the result', async () => {
    const run = vi.fn(async (_args: FalCallArgs) => ({
      bytes: new Uint8Array([1, 2]),
      contentType: 'image/jpeg',
      width: 2309,
      height: 1732,
    }));
    const provider = new FalProvider({
      name: 'fal-seedream',
      model: 'fal-ai/bytedance/seedream/v4.5/edit',
      costCents: 4,
      run,
    });

    const result = await provider.compose(baseInput(), 'PROMPT');

    const call = run.mock.calls[0]![0];
    expect(call.model).toBe('fal-ai/bytedance/seedream/v4.5/edit');
    expect(call.prompt).toBe('PROMPT');
    expect(call.images).toEqual([{ url: 'https://cdn/room.jpg' }, { url: 'https://cdn/product.png' }]);
    expect(call.imageSize.width * call.imageSize.height).toBeGreaterThanOrEqual(2560 * 1440);
    expect(Math.abs(call.imageSize.width / call.imageSize.height - 4 / 3)).toBeLessThan(0.02);

    expect(result).toMatchObject({
      contentType: 'image/jpeg',
      model: 'fal-ai/bytedance/seedream/v4.5/edit',
      costCents: 4,
      width: 2309,
      height: 1732,
    });
    expect(result.bytes).toEqual(new Uint8Array([1, 2]));
  });

  it('falls back to [product] when products[] is absent', async () => {
    const run = vi.fn(async (_args: FalCallArgs) => ({ bytes: new Uint8Array([9]), contentType: 'image/jpeg' }));
    const provider = new FalProvider({ name: 'fal', model: 'm', costCents: 4, run });
    const { products: _drop, ...single } = baseInput();
    void _drop;
    await provider.compose(single, 'P');
    expect(run.mock.calls[0]![0].images).toEqual([
      { url: 'https://cdn/room.jpg' },
      { url: 'https://cdn/product.png' },
    ]);
  });
});

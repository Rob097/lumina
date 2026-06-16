import { describe, expect, it, vi } from 'vitest';
import { ReplicateMattingProvider, type MattingRunner } from '../src/providers/bg-removal.js';
import { MockBgRemovalProvider } from '../src/providers/mock.js';

describe('ReplicateMattingProvider', () => {
  it('forwards the configured model + image ref to the runner and returns its cutout', async () => {
    const cutout = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
    const run = vi.fn<MattingRunner>(async () => cutout);
    const provider = new ReplicateMattingProvider({ model: 'matting/birefnet', run });

    const out = await provider.removeBackground({ url: 'https://x/product.jpg' });

    expect(run).toHaveBeenCalledWith({ model: 'matting/birefnet', image: { url: 'https://x/product.jpg' } });
    expect(out).toEqual(cutout);
  });

  it('passes raw bytes (with their media type) through to the runner', async () => {
    const run = vi.fn<MattingRunner>(async () => ({ bytes: new Uint8Array([9]), contentType: 'image/png' }));
    const provider = new ReplicateMattingProvider({ model: 'm', run });
    const bytes = new Uint8Array([4, 5, 6]);

    await provider.removeBackground({ bytes, contentType: 'image/jpeg' });

    expect(run).toHaveBeenCalledWith({ model: 'm', image: { bytes, contentType: 'image/jpeg' } });
  });
});

describe('MockBgRemovalProvider', () => {
  it('returns the provided product bytes unchanged (offline no-op preserves fidelity)', async () => {
    const bytes = new Uint8Array([7, 7, 7]);
    const out = await new MockBgRemovalProvider().removeBackground({ bytes, contentType: 'image/png' });
    expect(out.bytes).toEqual(bytes);
    expect(out.contentType).toBe('image/png');
  });

  it('returns deterministic placeholder bytes for a url-only ref (cannot fetch offline)', async () => {
    const out = await new MockBgRemovalProvider().removeBackground({ url: 'https://x/product.png' });
    expect(out.bytes.length).toBeGreaterThan(0);
    expect(out.contentType).toBe('image/png');
  });
});

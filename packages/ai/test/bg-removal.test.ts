import { describe, expect, it, vi } from 'vitest';
import {
  ReplicateMattingProvider,
  buildMattingRequest,
  type MattingRunner,
} from '../src/providers/bg-removal.js';
import { MockBgRemovalProvider } from '../src/providers/mock.js';

const HASH = 'f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7';

describe('buildMattingRequest (endpoint selection)', () => {
  it('uses the official-models endpoint for a bare owner/name (official model)', () => {
    const req = buildMattingRequest('black-forest-labs/flux', 'image', { url: 'https://x/p.jpg' });
    expect(req.url).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux/predictions');
    expect(req.body).toEqual({ input: { image: 'https://x/p.jpg' } });
  });

  it('uses the version endpoint for a pinned owner/name:version (non-official models need a version)', () => {
    const req = buildMattingRequest(`men1scus/birefnet:${HASH}`, 'image', { url: 'https://x/p.jpg' });
    expect(req.url).toBe('https://api.replicate.com/v1/predictions');
    expect(req.body).toEqual({ version: `men1scus/birefnet:${HASH}`, input: { image: 'https://x/p.jpg' } });
  });

  it('uses the version endpoint for a bare 64-char version id', () => {
    const req = buildMattingRequest(HASH, 'image', { url: 'https://x/p.jpg' });
    expect(req.url).toBe('https://api.replicate.com/v1/predictions');
    expect(req.body).toEqual({ version: HASH, input: { image: 'https://x/p.jpg' } });
  });

  it('honours a custom input field and encodes raw bytes as a data URI', () => {
    const req = buildMattingRequest('owner/name', 'input_image', {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpeg',
    });
    const input = req.body.input as Record<string, string>;
    expect(input.input_image).toMatch(/^data:image\/jpeg;base64,/);
  });
});

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

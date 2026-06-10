import { describe, expect, it } from 'vitest';
import { generationImageDeps } from '../src/lib/generations/images.js';

/**
 * The dashboard serves stored room/result objects as **short-lived signed R2 GET URLs** (D50): the
 * bucket stays private (HARD RULE #9 — room photos are people's homes) and no public CDN domain is
 * required. The image-resize CDN path (`/cdn-cgi/image/...`) needs a Cloudflare-fronted public bucket
 * we don't run, so it must never be emitted here.
 */
const fakeStorage = {
  presignDownload: async (key: string): Promise<string> => `https://r2.signed/${key}?sig=abc`,
};

describe('generationImageDeps', () => {
  it('serves stored objects as signed R2 GET URLs, never resize CDN URLs', async () => {
    const deps = generationImageDeps(fakeStorage);
    const url = await deps.imageUrl('results/m1/r.jpg');
    expect(url).toBe('https://r2.signed/results/m1/r.jpg?sig=abc');
    expect(url).not.toContain('/cdn-cgi/image');
  });

  it('returns null for a missing key (no result yet)', async () => {
    const deps = generationImageDeps(fakeStorage);
    expect(await deps.imageUrl(null)).toBeNull();
  });

  it('returns null when storage is unconfigured', async () => {
    const deps = generationImageDeps(null);
    expect(await deps.imageUrl('results/m1/r.jpg')).toBeNull();
  });
});

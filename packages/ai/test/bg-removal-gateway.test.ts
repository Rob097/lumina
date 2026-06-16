import { describe, expect, it, vi } from 'vitest';
import { buildCutoutPrompt } from '../src/prompts/cutout.js';
import {
  GatewayBgRemovalProvider,
  type GatewayBgRemovalRunner,
} from '../src/providers/bg-removal-gateway.js';

describe('buildCutoutPrompt', () => {
  it('asks to isolate the product on a clean background while preserving its identity exactly', () => {
    const p = buildCutoutPrompt();
    expect(p).toMatch(/isolate|cutout|remove .*background/i);
    expect(p).toMatch(/white|plain|solid/i);
    expect(p).toMatch(/preserve|unchanged|exact/i);
    expect(p).toMatch(/no .*(shadow|reflection)/i);
  });
});

describe('GatewayBgRemovalProvider', () => {
  it('forwards the model + cutout prompt + product image to the runner and returns the cutout', async () => {
    const cutout = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
    const run = vi.fn<GatewayBgRemovalRunner>(async () => cutout);
    const provider = new GatewayBgRemovalProvider({ model: 'google/gemini-3-pro-image', run });

    const out = await provider.removeBackground({ url: 'https://x/product.jpg' });

    expect(out).toEqual(cutout);
    expect(run).toHaveBeenCalledTimes(1);
    const args = run.mock.calls[0]?.[0];
    expect(args?.model).toBe('google/gemini-3-pro-image');
    expect(args?.image).toEqual({ url: 'https://x/product.jpg' });
    expect((args?.prompt ?? '').length).toBeGreaterThan(0);
  });
});

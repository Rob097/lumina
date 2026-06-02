import { describe, expect, it } from 'vitest';
import { buildFalInput } from '../src/providers/fal.js';
import { createOrchestratorFromEnv } from '../src/factory.js';

describe('buildFalInput', () => {
  it('orders ROOM first, PRODUCT second and requests a single image', () => {
    const input = buildFalInput('https://x/room.jpg', 'https://x/product.png', 'PROMPT');
    expect(input.image_urls).toEqual(['https://x/room.jpg', 'https://x/product.png']);
    expect(input.prompt).toBe('PROMPT');
    expect(input.num_images).toBe(1);
  });
});

describe('createOrchestratorFromEnv', () => {
  it('falls back to a mock provider when FAL_KEY is unset', async () => {
    const orch = createOrchestratorFromEnv({});
    const result = await orch.compose({
      room: { url: 'https://x/r.jpg' },
      product: { url: 'https://x/p.png' },
      category: 'furniture',
      policy: 'balanced',
    });
    expect(result.model).toBe('mock-compose');
    expect(result.costCents).toBe(0);
  });

  it('honors AI_PROVIDER=mock even with a key set', async () => {
    const orch = createOrchestratorFromEnv({ FAL_KEY: 'fake', AI_PROVIDER: 'mock' });
    const result = await orch.compose({
      room: { url: 'https://x/r.jpg' },
      product: { url: 'https://x/p.png' },
      category: 'lighting',
      policy: 'fast',
    });
    expect(result.model).toBe('mock-compose');
  });
});

import { describe, expect, it } from 'vitest';
import { buildFalInput } from '../src/providers/fal.js';

// fal.ts is kept dormant after the move to the Vercel AI Gateway (D49). The pure input mapping is still
// covered so the provider stays a working one-file swap behind `AIProvider` (HARD RULE #8).
describe('buildFalInput', () => {
  it('orders ROOM first, PRODUCT second and requests a single image', () => {
    const input = buildFalInput('https://x/room.jpg', 'https://x/product.png', 'PROMPT');
    expect(input.image_urls).toEqual(['https://x/room.jpg', 'https://x/product.png']);
    expect(input.prompt).toBe('PROMPT');
    expect(input.num_images).toBe(1);
  });
});

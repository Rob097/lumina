import { describe, expect, it } from 'vitest';
import { ProductInputSchema } from './product.js';

describe('product input', () => {
  it('defaults category to "other"', () => {
    const p = ProductInputSchema.parse({ name: 'Nube', imageUrl: 'https://shop.it/nube.png' });
    expect(p.category).toBe('other');
  });

  it('rejects a non-URL image', () => {
    expect(() => ProductInputSchema.parse({ name: 'Nube', imageUrl: 'not-a-url' })).toThrow();
  });

  it('keeps an external id when provided', () => {
    const p = ProductInputSchema.parse({
      externalId: 'SKU-1',
      name: 'Nube',
      imageUrl: 'https://shop.it/nube.png',
      category: 'furniture',
    });
    expect(p.externalId).toBe('SKU-1');
  });
});

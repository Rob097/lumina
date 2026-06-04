import { describe, expect, it } from 'vitest';
import {
  BulkProductsInputSchema,
  ProductInputSchema,
  ProductUpdateSchema,
  ProductsListResponseSchema,
} from './product.js';

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

describe('ProductUpdateSchema', () => {
  it('is a partial — any single field may be updated', () => {
    expect(ProductUpdateSchema.parse({ name: 'Renamed' }).name).toBe('Renamed');
    expect(ProductUpdateSchema.parse({}).name).toBeUndefined();
  });
});

describe('BulkProductsInputSchema', () => {
  it('accepts a non-empty batch of product inputs', () => {
    const res = BulkProductsInputSchema.parse({
      products: [
        { externalId: 'SKU1', name: 'A', imageUrl: 'https://s.it/a.png' },
        { externalId: 'SKU2', name: 'B', category: 'lighting', imageUrl: 'https://s.it/b.png' },
      ],
    });
    expect(res.products).toHaveLength(2);
    expect(res.products[1]?.category).toBe('lighting');
  });

  it('rejects an empty batch', () => {
    expect(() => BulkProductsInputSchema.parse({ products: [] })).toThrow();
  });
});

describe('ProductsListResponseSchema', () => {
  it('wraps products with a total count', () => {
    const res = ProductsListResponseSchema.parse({ products: [], total: 0 });
    expect(res.total).toBe(0);
  });
});

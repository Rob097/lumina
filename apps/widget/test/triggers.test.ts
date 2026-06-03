import { describe, it, expect } from 'vitest';
import { parseTrigger } from '../src/core/triggers.js';

function trigger(attrs: Record<string, string>): Element {
  const el = document.createElement('button');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe('parseTrigger', () => {
  it('reads a registered productId', () => {
    const opts = parseTrigger(trigger({ 'data-lumina-product': 'SKU-1234' }));
    expect(opts?.productId).toBe('SKU-1234');
    expect(opts?.product).toBeUndefined();
  });

  it('reads an inline product (name + image + category)', () => {
    const opts = parseTrigger(
      trigger({
        'data-lumina-product-name': 'Poltrona Nube',
        'data-lumina-product-image': 'https://shop.it/img/nube.png',
        'data-lumina-category': 'furniture',
      }),
    );
    expect(opts?.product).toEqual({
      name: 'Poltrona Nube',
      imageUrl: 'https://shop.it/img/nube.png',
      category: 'furniture',
    });
  });

  it('drops an invalid category but still parses the inline product', () => {
    const opts = parseTrigger(
      trigger({
        'data-lumina-product-name': 'Lamp',
        'data-lumina-product-image': 'https://shop.it/lamp.png',
        'data-lumina-category': 'not-a-category',
      }),
    );
    expect(opts?.product?.name).toBe('Lamp');
    expect(opts?.product?.category).toBeUndefined();
  });

  it('passes a per-element locale through metadata', () => {
    const opts = parseTrigger(
      trigger({ 'data-lumina-product': 'SKU-1', 'data-lumina-locale': 'it' }),
    );
    expect(opts?.metadata?.locale).toBe('it');
  });

  it('returns null when neither a productId nor a valid inline product is present', () => {
    expect(parseTrigger(trigger({}))).toBeNull();
    // name without image is not a valid inline product
    expect(parseTrigger(trigger({ 'data-lumina-product-name': 'Lamp' }))).toBeNull();
  });
});

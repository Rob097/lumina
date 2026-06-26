import { describe, expect, it } from 'vitest';
import { SHOULDER_WIDTH_CM, computeProductBox } from '../src/fashion-placement.js';

const placement = { anchor: { x: 0.5, y: 0.4 }, shoulderWidthNorm: 0.4 };

describe('computeProductBox (deterministic fashion size + position)', () => {
  it('sizes the product from its real cm via the shoulder-width reference', () => {
    // 1000px wide, shoulders span 0.4 => 400px === 40cm, so 10 px/cm. A 20x10cm bag => 200x100px.
    const box = computeProductBox(placement, { w: 20, h: 10, unit: 'cm' }, 1000, 1000);
    expect(box.width).toBe(200);
    expect(box.height).toBe(100);
  });

  it('scales linearly with the real dimensions (20cm -> 5cm halves the box)', () => {
    const big = computeProductBox(placement, { w: 20, h: 10, unit: 'cm' }, 1000, 1000);
    const small = computeProductBox(placement, { w: 10, h: 5, unit: 'cm' }, 1000, 1000);
    expect(small.width).toBe(big.width / 2);
    expect(small.height).toBe(big.height / 2);
  });

  it('converts inches to cm', () => {
    // 8in ~= 20.32cm => 203px at 10px/cm.
    const box = computeProductBox(placement, { w: 8, h: 4, unit: 'in' }, 1000, 1000);
    expect(box.width).toBe(Math.round(8 * 2.54 * 10));
  });

  it('hangs from the anchor: anchor is the top-centre of the box', () => {
    const box = computeProductBox(placement, { w: 20, h: 10, unit: 'cm' }, 1000, 1000);
    expect(box.left).toBe(Math.round(0.5 * 1000 - box.width / 2)); // centred on anchor x
    expect(box.top).toBe(Math.round(0.4 * 1000)); // top at anchor y (hangs down)
  });

  it('falls back to a body-relative size (~1/3 shoulder) when no dimensions are given', () => {
    const box = computeProductBox(placement, undefined, 1000, 1000, 1);
    expect(box.width).toBe(Math.round((0.4 * 1000) / 3));
  });

  it('uses the cutout aspect for height when only width is known', () => {
    const box = computeProductBox(placement, { w: 20, unit: 'cm' }, 1000, 1000, 2); // aspect 2 => half height
    expect(box.width).toBe(200);
    expect(box.height).toBe(100);
  });

  it('clamps the box to the image bounds', () => {
    const edge = computeProductBox({ anchor: { x: 0.99, y: 0.99 }, shoulderWidthNorm: 0.4 }, { w: 20, h: 10, unit: 'cm' }, 1000, 1000);
    expect(edge.left + edge.width).toBeLessThanOrEqual(1000);
    expect(edge.top + edge.height).toBeLessThanOrEqual(1000);
  });

  it('exposes the shoulder reference constant', () => {
    expect(SHOULDER_WIDTH_CM).toBe(40);
  });
});

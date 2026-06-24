import { describe, expect, it } from 'vitest';
import { buildComposePrompt } from '../src/prompt.js';
import type { ComposeInput } from '../src/types.js';

const base: ComposeInput = {
  room: { url: 'https://x/selfie.jpg' },
  product: { url: 'https://x/bag.png' },
  category: 'fashion',
  policy: 'fast',
};

describe('buildComposePrompt — fashion / accessory placement (person path)', () => {
  it('switches to the fashion try-on compositor and treats the upload as a person (SUBJECT), not a room', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/fashion try-on compositor/i);
    expect(p).toMatch(/SUBJECT/);
    expect(p).toMatch(/person/i);
    expect(p).not.toMatch(/environment compositor/i); // never the furniture master prompt
  });

  it('preserves the person identity and adds ONLY the accessory', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/preserve the subject/i);
    expect(p).toMatch(/face/i);
    expect(p).toMatch(/add only the accessory/i);
  });

  it('scales to the hand/forearm with finger occlusion + a contact shadow (not room/door scale)', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/forearm/i);
    expect(p).toMatch(/fingers/i);
    expect(p).toMatch(/contact shadow/i);
  });

  it('suppresses scene/exterior anchoring even when an exterior scene type is passed', () => {
    const p = buildComposePrompt({ ...base, sceneType: 'exterior' });
    expect(p).not.toMatch(/EXTERIOR scene/);
    expect(p).not.toMatch(/place the supplied product once/i);
  });

  it('uses the placement hint when provided, else a default hand/handle hint', () => {
    expect(buildComposePrompt({ ...base, placementHint: 'on the shoulder by the strap' })).toContain(
      'on the shoulder by the strap',
    );
    expect(buildComposePrompt(base)).toMatch(/hand by its handle/i);
  });

  it('injects the fashion playbook tuning rules (anchored to the body, not furniture scale)', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/TUNING RULES/i);
    expect(p).toMatch(/two hands|fingers and thumb/i);
  });

  it('requires the accessory to be fully opaque (no see-through/translucent render)', () => {
    const p = buildComposePrompt(base).toLowerCase();
    expect(p).toMatch(/opaque|see-through|see through|translucent|transparen/);
  });

  it('carries real-world dimensions and the product identity anchor when provided', () => {
    const p = buildComposePrompt({
      ...base,
      dimensions: { w: 25, h: 18, unit: 'cm' },
      productDescription: 'a small marble-effect sculptural handbag',
    });
    expect(p).toMatch(/25/);
    expect(p).toContain('a small marble-effect sculptural handbag');
  });

  it('subordinates shopper free-text after the hard rules (never overrides identity preservation)', () => {
    const p = buildComposePrompt({ ...base, customInstructions: 'make the bag look shiny' });
    expect(p).toContain('make the bag look shiny');
    expect(p.indexOf('make the bag look shiny')).toBeGreaterThan(p.indexOf('HARD RULES'));
  });
});

describe('buildComposePrompt — the furniture path is UNCHANGED by the fashion branch', () => {
  const furniture: ComposeInput = {
    room: { url: 'https://x/room.jpg' },
    product: { url: 'https://x/lamp.png' },
    category: 'lighting',
    policy: 'balanced',
  };

  it('keeps the environment compositor and never leaks fashion wording', () => {
    const p = buildComposePrompt(furniture);
    expect(p).toMatch(/environment compositor/i);
    expect(p).not.toMatch(/fashion try-on/i);
    expect(p).not.toMatch(/SUBJECT/);
    expect(p).not.toMatch(/add only the accessory/i);
  });

  // Regression tripwire: locks the four furniture prompt variants byte-for-byte. Pure string building (no
  // model call) — any accidental edit to the furniture prompts/playbook fails CI. Captured on first run.
  it('locks the four furniture prompt variants byte-for-byte', () => {
    expect(buildComposePrompt(furniture)).toMatchSnapshot('object_placement');
    expect(
      buildComposePrompt({
        ...furniture,
        mode: 'surface_covering',
        target: { description: 'the back wall' },
        repetition: { kind: 'grid', estimatedCount: 10 },
      }),
    ).toMatchSnapshot('surface_covering');
    expect(
      buildComposePrompt({ ...furniture, mode: 'object_replacement', target: { description: 'the existing wardrobe' } }),
    ).toMatchSnapshot('object_replacement');
    expect(
      buildComposePrompt({
        ...furniture,
        products: [{ url: 'https://x/p1.png' }, { url: 'https://x/p2.png' }],
        productInfos: [
          { name: 'Aura Lamp', category: 'lighting', dimensions: { w: 30, h: 150, unit: 'cm' } },
          { name: 'Nube Sofa', category: 'furniture' },
        ],
      }),
    ).toMatchSnapshot('multi_product');
  });
});

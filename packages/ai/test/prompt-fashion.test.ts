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

  it('preserves the person identity and adds ONLY the product', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/preserve the subject/i);
    expect(p).toMatch(/face/i);
    expect(p).toMatch(/add only the product/i);
  });

  it('is GENERIC across fashion items (jewellery, eyewear, hats, bags — not bag-only)', () => {
    const p = buildComposePrompt(base).toLowerCase();
    expect(p).toMatch(/earring/);
    expect(p).toMatch(/glasses|eyewear/);
    expect(p).toMatch(/hat/);
  });

  it('seats the product with realistic occlusion + a contact shadow (not room/door scale)', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/occlusion/i);
    expect(p).toMatch(/contact shadow/i);
  });

  it('suppresses scene/exterior anchoring even when an exterior scene type is passed', () => {
    const p = buildComposePrompt({ ...base, sceneType: 'exterior' });
    expect(p).not.toMatch(/EXTERIOR scene/);
    expect(p).not.toMatch(/place the supplied product once/i);
  });

  it('uses the placement hint when provided, else a default "where this kind of item is worn" placement', () => {
    expect(buildComposePrompt({ ...base, placementHint: 'on the shoulder by the strap' })).toContain(
      'on the shoulder by the strap',
    );
    expect(buildComposePrompt(base)).toMatch(/worn or carried/i);
  });

  it('forbids adding or duplicating ANY body part to wear the item (no invented hand/arm/ear)', () => {
    const p = buildComposePrompt(base).toLowerCase();
    expect(p).toMatch(/do not add|never add/);
    expect(p).toMatch(/body part|hand, arm/);
  });

  it('injects the fashion playbook tuning rules (generic, not furniture scale)', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/TUNING RULES/i);
    expect(p).toMatch(/matched pair|real-world size/i);
  });

  it('requires the accessory to be fully opaque (no see-through/translucent render)', () => {
    const p = buildComposePrompt(base).toLowerCase();
    expect(p).toMatch(/opaque|see-through|see through|translucent|transparen/);
  });

  it('renders the natural number of pieces (one item or a matched pair), never duplicated onto a second spot', () => {
    const p = buildComposePrompt(base).toLowerCase();
    expect(p).toMatch(/single item|matched pair|natural number/);
    expect(p).toMatch(/second spot|duplicate a single|split/);
  });

  it("follows the placement guide and the subject's pose (soft — no rigid left/right)", () => {
    const p = buildComposePrompt(base).toLowerCase();
    expect(p).toMatch(/guide/);
    expect(p).toMatch(/pose|prepared/);
  });

  it('treats the real-world dimensions as the AUTHORITATIVE size and forbids enlarging', () => {
    const p = buildComposePrompt({ ...base, dimensions: { w: 20, h: 10, unit: 'cm' } }).toLowerCase();
    expect(p).toMatch(/20/);
    expect(p).toMatch(/authoritative|real size|real-world size/);
    expect(p).toMatch(/never enlarge|do not enlarge|not enlarge/);
  });

  it('adds a labeled placement-reference instruction ONLY when a guide diagram is supplied', () => {
    expect(buildComposePrompt(base)).not.toMatch(/PLACEMENT REFERENCE/);
    const withDiagram = buildComposePrompt({ ...base, placementDiagram: { url: 'https://x/guide.png' } });
    expect(withDiagram).toMatch(/PLACEMENT REFERENCE/);
    const lc = withDiagram.toLowerCase();
    expect(lc).toMatch(/do not copy/); // never copy the drawn figure/style
    expect(lc).toMatch(/must not change|do not change|follow the first/); // never alter the real subject/scene
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

  it('adds the placement-reference for furniture too, only when a diagram is supplied (generic)', () => {
    expect(buildComposePrompt(furniture)).not.toMatch(/PLACEMENT REFERENCE/);
    expect(buildComposePrompt({ ...furniture, placementDiagram: { url: 'https://x/g.png' } })).toMatch(
      /PLACEMENT REFERENCE/,
    );
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

import { describe, expect, it } from 'vitest';
import { buildComposePrompt } from '../src/prompt.js';
import type { ComposeInput } from '../src/types.js';

const base: ComposeInput = {
  room: { url: 'https://x/room.jpg' },
  product: { url: 'https://x/product.png' },
  category: 'lighting',
  policy: 'balanced',
};

describe('buildComposePrompt', () => {
  it('always enforces identity preservation and environment integrity', () => {
    const p = buildComposePrompt(base);
    expect(p).toContain('photorealistic environment compositor');
    expect(p).toMatch(/exact geometry|identity|exact product/i);
    expect(p).toMatch(/do not (alter|change) the (room|scene|environment)/i);
    expect(p).toMatch(/contact shadow/i);
  });

  it('pins the room framing/aspect ratio so the result lines up with the original (no zoom)', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/aspect ratio/i);
    expect(p).toMatch(/do not .*(crop|zoom|re-?frame)/i);
  });

  it('uses the placement hint when provided, else a natural-location instruction', () => {
    expect(buildComposePrompt({ ...base, placementHint: 'on the wall above the sofa' })).toContain(
      'on the wall above the sofa',
    );
    expect(buildComposePrompt(base)).toMatch(/most natural, functional location/i);
  });

  it('injects scene facts (lighting, surfaces, scale, placement) when a confident analysis is present', () => {
    const p = buildComposePrompt({
      ...base,
      scene: {
        isExterior: false,
        lighting: { direction: 'top-left', temperatureK: 3200, intensity: 'high' },
        surfaces: [{ kind: 'floor' }, { kind: 'wall', orientation: 'back wall' }],
        tiltDegrees: 0,
        roomScale: { ceilingHeightM: 2.6, referenceObjects: ['door'] },
        suggestedPlacement: { region: 'against the back wall' },
        quality: { blurry: false, dark: false, cluttered: false },
        confidence: 0.8,
      },
    });
    expect(p).toContain('top-left');
    expect(p).toContain('3200');
    expect(p).toMatch(/high/i);
    expect(p).toMatch(/floor/i);
    expect(p).toMatch(/2\.6/);
    expect(p).toContain('against the back wall');
  });

  it('drops low-confidence scene facts (falls back to composing without them)', () => {
    const p = buildComposePrompt({
      ...base,
      scene: {
        isExterior: false,
        lighting: { direction: 'top-left', intensity: 'high' },
        surfaces: [],
        tiltDegrees: 0,
        quality: { blurry: true, dark: true, cluttered: true },
        confidence: 0.05,
      },
    });
    expect(p).not.toMatch(/Scene lighting/i);
  });

  it('adds exterior guidance when the scene analysis says it is exterior', () => {
    const p = buildComposePrompt({
      ...base,
      scene: {
        isExterior: true,
        lighting: { direction: 'front', intensity: 'high' },
        surfaces: [{ kind: 'ground' }],
        tiltDegrees: 0,
        quality: { blurry: false, dark: false, cluttered: false },
        confidence: 0.9,
      },
    });
    expect(p).toMatch(/EXTERIOR scene/);
  });

  it('has the model decide the placement archetype itself, with open-ended examples (no fixed category)', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/do not rely.*on a fixed category/i);
    expect(p).toMatch(/not an exhaustive list/i);
    // a few illustrative archetypes are present, but only as examples
    expect(p).toMatch(/free-standing object|wall- or ceiling-mounted|reflective surface/i);
  });

  it('passes the merchant category only as a soft, possibly-wrong hint', () => {
    const p = buildComposePrompt(base);
    expect(p).toMatch(/category \(approximate merchant hint/i);
  });

  it('adds exterior guidance only when the scene is exterior', () => {
    // The system rules always mention "interior OR exterior"; the per-request EXTERIOR guidance does not.
    expect(buildComposePrompt(base)).not.toMatch(/EXTERIOR scene/);
    const exterior = buildComposePrompt({ ...base, sceneType: 'exterior', category: 'outdoor' });
    expect(exterior).toMatch(/EXTERIOR scene/);
    expect(exterior).toMatch(/ground plane|sky|sun/i);
  });

  it('includes real-world dimensions when provided', () => {
    const p = buildComposePrompt({ ...base, dimensions: { w: 40, h: 150, unit: 'cm' } });
    expect(p).toMatch(/40/);
    expect(p).toMatch(/150/);
  });

  it('appends a negative guard', () => {
    expect(buildComposePrompt(base)).toMatch(/avoid:.*cartoonish/i);
  });

  it('injects the product description/analysis as an identity anchor when provided', () => {
    const p = buildComposePrompt({
      ...base,
      productDescription: 'a white articulated Anglepoise floor lamp with a conical shade',
    });
    expect(p).toContain('a white articulated Anglepoise floor lamp with a conical shade');
    expect(p).toMatch(/insert this exact/i);
  });

  it('omits the product-description line when none is provided', () => {
    expect(buildComposePrompt(base)).not.toMatch(/insert this exact/i);
  });

  it('injects the owner-editable playbook tuning rules into every compose prompt', () => {
    expect(buildComposePrompt(base)).toMatch(/TUNING RULES/i);
  });

  it('includes shopper custom instructions as a soft preference, after the hard rules', () => {
    const p = buildComposePrompt({ ...base, customInstructions: 'near the reading nook by the window' });
    expect(p).toContain('near the reading nook by the window');
    // It must be framed as not overriding the protected rules…
    expect(p).toMatch(/must not override|without (breaking|violating)/i);
    // …and must appear after the HARD RULES block, never before it.
    expect(p.indexOf('near the reading nook by the window')).toBeGreaterThan(p.indexOf('HARD RULES'));
  });

  it('omits the custom-instruction block when none is given', () => {
    expect(buildComposePrompt(base)).not.toMatch(/ADDITIONAL USER PREFERENCE/i);
  });
});

describe('buildComposePrompt — mode-specific compose (Gen v3 Phase 2)', () => {
  it('always layers the task on the always-true COMPOSE_SYSTEM_INSTRUCTION', () => {
    for (const mode of ['object_placement', 'surface_covering', 'object_replacement'] as const) {
      expect(buildComposePrompt({ ...base, mode })).toContain('photorealistic environment compositor');
    }
  });

  it('object_placement (and no mode) places the product once at the natural/target location', () => {
    expect(buildComposePrompt(base)).toMatch(/most natural, functional location/i);
    expect(buildComposePrompt({ ...base, mode: 'object_placement' })).toMatch(/place the (supplied )?product once/i);
  });

  it('surface_covering re-surfaces the target as a REPEATING unit — not a single object, not pasted copies', () => {
    const p = buildComposePrompt({
      ...base,
      mode: 'surface_covering',
      target: { description: 'the back wall' },
      repetition: { kind: 'grid', estimatedCount: 12 },
    });
    expect(p).toMatch(/re-?surface|clad|cover the/i);
    expect(p).toContain('the back wall');
    expect(p).toMatch(/repeat/i);
    expect(p).toMatch(/grid/i);
    expect(p).toMatch(/not.*(a )?single (isolated )?unit/i);
  });

  it('surface_covering changes ONLY the target surface and never re-frames/rotates the photo', () => {
    const p = buildComposePrompt({ ...base, mode: 'surface_covering', target: { description: 'the left wall' } });
    expect(p).toMatch(/only|everything (else|other)/i);
    expect(p).toMatch(/do not.*(rotate|crop|re-?frame)/i);
  });

  it('object_replacement replaces the existing element matching its position/scale/perspective', () => {
    const p = buildComposePrompt({
      ...base,
      mode: 'object_replacement',
      target: { description: 'the existing wardrobe' },
    });
    expect(p).toMatch(/replace/i);
    expect(p).toContain('the existing wardrobe');
    expect(p).toMatch(/position|scale|perspective/i);
  });
});

describe('buildComposePrompt — multi-product placement (F2)', () => {
  const multi: ComposeInput = {
    ...base,
    products: [{ url: 'https://x/p1.png' }, { url: 'https://x/p2.png' }],
    productInfos: [
      { name: 'Aura Lamp', category: 'lighting', dimensions: { w: 30, h: 150, unit: 'cm' } },
      { name: 'Nube Sofa', category: 'furniture' },
    ],
  };

  it('layers the multi-object task on the always-true system instruction and lists every product', () => {
    const p = buildComposePrompt(multi);
    expect(p).toContain('photorealistic environment compositor');
    expect(p).toContain('Aura Lamp');
    expect(p).toContain('Nube Sofa');
  });

  it('instructs distinct placement and forbids merging / stacking / duplicating / omitting', () => {
    const p = buildComposePrompt(multi);
    expect(p).toMatch(/distinct/i);
    expect(p).toMatch(/do not.*(merge|stack|duplicate|omit)/i);
  });

  it('infers each product operation, so a surfacing product clads its WHOLE surface (not a single patch)', () => {
    const p = buildComposePrompt({
      ...multi,
      productInfos: [
        { name: 'Aura Lamp', category: 'lighting' },
        { name: 'Acoustic Panel', category: 'decor' },
      ],
    });
    expect(p).toMatch(/place/i); // discrete objects are placed
    expect(p).toMatch(/clad|cover|re-?surface/i); // surfacing materials clad
    expect(p).toMatch(/entire|whole/i); // …the whole surface, not a patch
  });

  it('keeps the framing/aspect-ratio rule and includes per-product real-world dimensions', () => {
    const p = buildComposePrompt(multi);
    expect(p).toMatch(/150/); // the lamp's height
    expect(p).toMatch(/framing|aspect ratio/i);
  });

  it('does not use the single-product "place the supplied product once" phrasing', () => {
    expect(buildComposePrompt(multi)).not.toMatch(/place the supplied product once/i);
  });

  it('carries the shopper custom instructions through, after the hard rules', () => {
    const p = buildComposePrompt({ ...multi, customInstructions: 'keep it cosy' });
    expect(p).toContain('keep it cosy');
    expect(p.indexOf('keep it cosy')).toBeGreaterThan(p.indexOf('HARD RULES'));
  });

  it('treats a single-element productInfos as normal single placement', () => {
    const single: ComposeInput = { ...base, productInfos: [{ name: 'Solo', category: 'lighting' }] };
    expect(buildComposePrompt(single)).toMatch(/most natural, functional location/i);
  });
});

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

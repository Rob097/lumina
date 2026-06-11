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
  it('always enforces identity preservation and room integrity', () => {
    const p = buildComposePrompt(base);
    expect(p).toContain('photorealistic interior compositor');
    expect(p).toMatch(/exact geometry|identity|exact product/i);
    expect(p).toMatch(/do not (alter|change) the room/i);
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

  it('injects scene lighting when a scene analysis is present', () => {
    const p = buildComposePrompt({
      ...base,
      scene: { lightDir: 'top-left', colorTempK: 3200, style: 'scandi', surfaces: ['floor', 'wall'] },
    });
    expect(p).toContain('top-left');
    expect(p).toContain('3200');
  });

  it('adds category-specific guidance (lighting → glow/cast)', () => {
    expect(buildComposePrompt(base)).toMatch(/glow|cast|fixture/i);
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

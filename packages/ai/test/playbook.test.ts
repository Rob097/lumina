import { describe, expect, it } from 'vitest';
import {
  FASHION_GENERATION_RULES,
  GENERATION_RULES,
  fashionPlaybookRules,
  playbookRules,
} from '../src/prompts/playbook.js';

describe('generation playbook (owner-editable tuning rules)', () => {
  it('renders the seeded rules as a single always-apply block', () => {
    const block = playbookRules();
    expect(block).toMatch(/TUNING RULES/i);
    expect(GENERATION_RULES.length).toBeGreaterThan(0);
    for (const rule of GENERATION_RULES) expect(block).toContain(rule);
  });

  it('seeds the two known fixes: full-surface cladding and realistic scale', () => {
    const block = playbookRules().toLowerCase();
    expect(block).toMatch(/entire|whole/); // surfacing products clad the WHOLE surface (panels fix)
    expect(block).toMatch(/scale|size/); // realistic real-world scale (giant-lamp fix)
  });

  it('seeds the observed-failure fixes: light-fixture form, pattern orientation, no product-photo background', () => {
    const block = playbookRules().toLowerCase();
    // a lamp must stay a physical fixture, not become a glowing blob/halo (exterior facade lamp case)
    expect(block).toMatch(/light fixture|lamp/);
    expect(block).toMatch(/glow|blob|halo|sphere/);
    // a surfacing pattern keeps its orientation (slats rendered rotated case)
    expect(block).toMatch(/orientation|vertical|rotate/);
    // the product photo's own background/props must never leak into the scene
    expect(block).toMatch(/product photo|background|props/);
  });
});

describe('fashion generation playbook (separate from the furniture rules)', () => {
  it('renders the fashion rules as a single always-apply block', () => {
    const block = fashionPlaybookRules();
    expect(block).toMatch(/TUNING RULES/i);
    expect(FASHION_GENERATION_RULES.length).toBeGreaterThan(0);
    for (const rule of FASHION_GENERATION_RULES) expect(block).toContain(rule);
  });

  it('anchors scale to the body (hand/fingers) and keeps furniture-only scale rules OUT', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/hand|two hands|fingers|grip/);
    // furniture scale cues (floor-lamp heights, door references) must never leak into a portrait prompt
    expect(block).not.toMatch(/floor lamp|1\.5|1\.8|door/);
  });

  it('seeds the no-transparency fix: the accessory renders fully opaque (observed see-through bag)', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/opaque|see-through|see through|translucent|transparen/);
  });

  it('seeds the no-invented-limb fix: carry on the EXISTING arm, never add a hand/arm', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/existing|already has free|free arm/);
    expect(block).toMatch(/never add|invent|duplicat/);
    expect(block).toMatch(/arm|forearm|elbow/);
  });

  it('seeds the one-bag + real-size fixes (observed: a bag on each arm, oversized)', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/one (bag|accessory)|single (bag|accessory)/); // exactly one
    expect(block).toMatch(/each arm|second bag|other arm/); // never a bag per arm
    expect(block).toMatch(/real size|real-world|one hand|never enlarge/); // size anchored, not oversized
    expect(block).not.toMatch(/two hands/); // the misleading oversizing heuristic is gone
  });
});

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

  it('anchors scale to the body and keeps furniture-only scale rules OUT', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/real-world size|hand/);
    // furniture scale cues (floor-lamp heights, door references) must never leak into a portrait prompt
    expect(block).not.toMatch(/floor lamp|1\.5|1\.8|door/);
  });

  it('is GENERIC across fashion items, not hardcoded to bags', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/earring/);
    expect(block).toMatch(/glasses|eyewear|hat/);
    // bag-only carry mechanics must not be baked into the always-apply rules
    expect(block).not.toMatch(/crook of the elbow|hanging from the hand by its handle/);
  });

  it('seeds the no-transparency fix: the product renders fully opaque (observed see-through item)', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/opaque|see-through|see through|translucent|transparen/);
  });

  it('seeds the no-invented-body-part fix: never add a hand/arm/ear to wear it', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/never add|duplicat/);
    expect(block).toMatch(/body part|hand, arm/);
  });

  it('seeds the handbag elbow-hang rule (hang from the bent elbow, not gripped in the hand)', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/elbow/);
    expect(block).toMatch(/hang|dangle/);
    expect(block).toMatch(/not.*grip|hand stays free/);
  });

  it('seeds the one-item + real-size fixes (observed: a bag on each arm, oversized)', () => {
    const block = fashionPlaybookRules().toLowerCase();
    expect(block).toMatch(/single (bag|item)|matched pair|natural number/); // right count
    expect(block).toMatch(/second spot|duplicate a single|split a set/); // never duplicated/split
    expect(block).toMatch(/real-world|never enlarge/); // size anchored, not oversized
    expect(block).not.toMatch(/two hands/); // the misleading oversizing heuristic is gone
  });
});

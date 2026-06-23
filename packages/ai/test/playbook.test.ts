import { describe, expect, it } from 'vitest';
import { GENERATION_RULES, playbookRules } from '../src/prompts/playbook.js';

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
});

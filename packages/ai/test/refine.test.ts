import { describe, expect, it } from 'vitest';
import { buildComposePrompt } from '../src/prompt.js';
import { REFINE_SYSTEM_INSTRUCTION, buildRefineTask } from '../src/prompts/refine.js';
import type { ComposeInput } from '../src/types.js';

const layoutInput: ComposeInput = {
  room: { url: 'https://x/room.jpg' },
  product: { url: 'https://x/product.png' },
  layout: { url: 'https://x/layout.jpg' },
  category: 'decor',
  dimensions: { w: 60, h: 60, unit: 'cm' },
  policy: 'balanced',
};

describe('REFINE_SYSTEM_INSTRUCTION', () => {
  it('refines a layout guide while preserving identity, coverage and alignment', () => {
    const s = REFINE_SYSTEM_INSTRUCTION;
    expect(s).toMatch(/refine/i);
    expect(s).toMatch(/layout/i);
    expect(s).toMatch(/preserve|identity|exact/i);
    expect(s).toMatch(/tiled|grid|cover/i); // coverage language
    expect(s).toMatch(/align|parallel|perspective/i); // fixes the "crooked panel"
    expect(s).toMatch(/do not (alter|change) the/i); // room integrity
  });

  it('allows intentional repetition (no "avoid duplicated product" rule)', () => {
    expect(REFINE_SYSTEM_INSTRUCTION).not.toMatch(/duplicated product/i);
  });
});

describe('buildRefineTask', () => {
  it('keeps the layout coverage/count and carries the real dimensions', () => {
    const t = buildRefineTask(layoutInput);
    expect(t).toMatch(/coverage|tiled|grid/i);
    expect(t).toMatch(/count|number of units|units/i);
    expect(t).toMatch(/60/);
  });
});

describe('buildComposePrompt (mode selection)', () => {
  it('switches to REFINE mode when a layout guide is present', () => {
    const p = buildComposePrompt(layoutInput);
    expect(p).toContain(REFINE_SYSTEM_INSTRUCTION);
    expect(p).toMatch(/REFINE DETAILS/);
  });

  it('stays in normal compose mode without a layout', () => {
    const { layout: _omit, ...noLayout } = layoutInput;
    const p = buildComposePrompt(noLayout);
    expect(p).toContain('photorealistic environment compositor');
    expect(p).not.toContain('REFINE DETAILS');
  });
});

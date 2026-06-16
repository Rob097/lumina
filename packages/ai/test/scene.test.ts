import { describe, expect, it, vi } from 'vitest';
import { buildScenePrompt } from '../src/prompts/scene.js';
import { GatewaySceneProvider } from '../src/providers/gateway-scene.js';
import type { SceneAnalysis } from '@lumina/shared';

const analysis: SceneAnalysis = {
  isExterior: false,
  lighting: { direction: 'top-left', temperatureK: 4000, intensity: 'medium' },
  surfaces: [{ kind: 'floor' }, { kind: 'wall', orientation: 'back wall' }],
  tiltDegrees: -2,
  quality: { blurry: false, dark: false, cluttered: false },
  confidence: 0.8,
};

describe('buildScenePrompt', () => {
  it('asks for the per-image scene facts as a strict JSON object', () => {
    const p = buildScenePrompt();
    expect(p).toMatch(/strict JSON|JSON object/i);
    expect(p).toMatch(/interior|exterior|indoor|outdoor/i);
    expect(p).toMatch(/light/i);
    expect(p).toMatch(/tilt/i);
    expect(p).toMatch(/surface/i);
    expect(p).toMatch(/confidence/i);
  });

  it('describes per-image facts, never a product category', () => {
    expect(buildScenePrompt()).not.toMatch(/category/i);
  });
});

describe('GatewaySceneProvider', () => {
  it('forwards the model + prompt + room image to the runner and returns the analysis', async () => {
    const run = vi.fn().mockResolvedValue(analysis);
    const provider = new GatewaySceneProvider({ model: 'google/gemini-2.5-flash', run });
    const room = { url: 'https://x/room.jpg' };

    const result = await provider.analyzeScene(room);

    expect(result).toEqual(analysis);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'google/gemini-2.5-flash', room }),
    );
    const prompt = run.mock.calls[0]?.[0]?.prompt ?? '';
    expect(prompt.length).toBeGreaterThan(0);
  });
});

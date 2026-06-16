import { describe, expect, it } from 'vitest';
import { createOrchestratorFromEnv, selectSceneProvider } from '../src/factory.js';
import { GatewaySceneProvider } from '../src/providers/gateway-scene.js';
import { MockSceneProvider } from '../src/providers/mock.js';

describe('selectSceneProvider (env → provider)', () => {
  it('uses the neutral mock offline (no gateway creds)', () => {
    expect(selectSceneProvider({})).toBeInstanceOf(MockSceneProvider);
  });

  it('uses the mock when AI_PROVIDER=mock even if creds are present', () => {
    expect(selectSceneProvider({ AI_GATEWAY_API_KEY: 'k', AI_PROVIDER: 'mock' })).toBeInstanceOf(
      MockSceneProvider,
    );
  });

  it('uses the gateway scene provider when creds are present', () => {
    expect(selectSceneProvider({ AI_GATEWAY_API_KEY: 'k' })).toBeInstanceOf(GatewaySceneProvider);
    expect(selectSceneProvider({ VERCEL_OIDC_TOKEN: 'oidc' })).toBeInstanceOf(GatewaySceneProvider);
  });
});

describe('createOrchestratorFromEnv — scene wiring', () => {
  it('wires a neutral mock scene analysis in the offline orchestrator', async () => {
    const orch = createOrchestratorFromEnv({});
    const scene = await orch.analyzeScene({ url: 'https://x/room.jpg' });
    expect(scene?.isExterior).toBe(false);
    expect(scene?.lighting.direction).toBe('top-left');
  });
});

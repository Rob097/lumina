import { describe, expect, it } from 'vitest';
import { createOrchestratorFromEnv, selectPlannerProvider } from '../src/factory.js';
import { GatewayPlannerProvider } from '../src/providers/gateway-planner.js';
import { MockPlannerProvider } from '../src/providers/mock.js';

describe('selectPlannerProvider (env → provider)', () => {
  it('uses the neutral mock offline (no gateway creds)', () => {
    expect(selectPlannerProvider({})).toBeInstanceOf(MockPlannerProvider);
  });

  it('uses the mock when AI_PROVIDER=mock even if creds are present', () => {
    expect(selectPlannerProvider({ AI_GATEWAY_API_KEY: 'k', AI_PROVIDER: 'mock' })).toBeInstanceOf(
      MockPlannerProvider,
    );
  });

  it('uses the gateway planner when creds are present', () => {
    expect(selectPlannerProvider({ AI_GATEWAY_API_KEY: 'k' })).toBeInstanceOf(GatewayPlannerProvider);
    expect(selectPlannerProvider({ VERCEL_OIDC_TOKEN: 'oidc' })).toBeInstanceOf(GatewayPlannerProvider);
  });
});

describe('createOrchestratorFromEnv — planner wiring', () => {
  it('wires a neutral mock plan in the offline orchestrator', async () => {
    const orch = createOrchestratorFromEnv({});
    const plan = await orch.plan({ room: { url: 'https://x/room.jpg' }, product: { url: 'https://x/p.png' } });
    expect(plan?.mode).toBe('object_placement');
    expect(plan?.repetition.kind).toBe('single');
  });
});

import { describe, expect, it } from 'vitest';
import { createOrchestratorFromEnv } from '../src/factory.js';
import { selectBgRemovalProvider } from '../src/factory.js';
import { ReplicateMattingProvider } from '../src/providers/bg-removal.js';
import { GatewayBgRemovalProvider } from '../src/providers/bg-removal-gateway.js';
import { MockBgRemovalProvider } from '../src/providers/mock.js';

describe('selectBgRemovalProvider (env → provider)', () => {
  it('selects Replicate matting when explicitly requested with token + model', () => {
    const p = selectBgRemovalProvider({
      BG_REMOVAL_PROVIDER: 'replicate',
      REPLICATE_API_TOKEN: 't',
      BG_REMOVAL_MODEL: 'owner/birefnet',
    });
    expect(p).toBeInstanceOf(ReplicateMattingProvider);
  });

  it('defaults to Replicate when a token + model are present and no provider is named', () => {
    const p = selectBgRemovalProvider({ REPLICATE_API_TOKEN: 't', BG_REMOVAL_MODEL: 'owner/birefnet' });
    expect(p).toBeInstanceOf(ReplicateMattingProvider);
  });

  it('selects the mock when explicitly requested', () => {
    expect(selectBgRemovalProvider({ BG_REMOVAL_PROVIDER: 'mock' })).toBeInstanceOf(MockBgRemovalProvider);
  });

  it('selects the Vercel Gateway cutout when requested with gateway creds (no Replicate needed)', () => {
    expect(selectBgRemovalProvider({ BG_REMOVAL_PROVIDER: 'gateway', AI_GATEWAY_API_KEY: 'k' })).toBeInstanceOf(
      GatewayBgRemovalProvider,
    );
    expect(selectBgRemovalProvider({ BG_REMOVAL_PROVIDER: 'gateway', VERCEL_OIDC_TOKEN: 'oidc' })).toBeInstanceOf(
      GatewayBgRemovalProvider,
    );
  });

  it('is undefined when gateway is requested but no gateway creds are present (degrade, not crash)', () => {
    expect(selectBgRemovalProvider({ BG_REMOVAL_PROVIDER: 'gateway' })).toBeUndefined();
  });

  it('is undefined when replicate is requested but the token or model is missing (degrade, not crash)', () => {
    expect(selectBgRemovalProvider({ BG_REMOVAL_PROVIDER: 'replicate', REPLICATE_API_TOKEN: 't' })).toBeUndefined();
    expect(selectBgRemovalProvider({ BG_REMOVAL_PROVIDER: 'replicate', BG_REMOVAL_MODEL: 'o/m' })).toBeUndefined();
  });

  it('is undefined when nothing is configured', () => {
    expect(selectBgRemovalProvider({})).toBeUndefined();
    expect(selectBgRemovalProvider({ BG_REMOVAL_PROVIDER: 'none' })).toBeUndefined();
  });
});

describe('createOrchestratorFromEnv — background removal wiring', () => {
  it('wires a fidelity-preserving mock cutout in the offline (no-creds) orchestrator', async () => {
    const orch = createOrchestratorFromEnv({});
    const out = await orch.bgRemoval({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
    expect(out?.bytes).toEqual(new Uint8Array([1, 2, 3])); // mock = no-op, product pixels preserved
  });

  it('has no cutout when gateway creds are present but background removal is unconfigured', async () => {
    const orch = createOrchestratorFromEnv({ AI_GATEWAY_API_KEY: 'k' });
    expect(await orch.bgRemoval({ bytes: new Uint8Array([1]) })).toBeNull();
  });
});

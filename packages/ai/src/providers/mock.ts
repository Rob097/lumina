import type { AIProvider, ComposeInput, ProviderResult, SceneAnalysis, SceneProvider } from '../types.js';

export interface MockProviderOptions {
  name: string;
  model?: string;
  costCents?: number;
  /** Fail the first N calls, then succeed. */
  failTimes?: number;
  /** Always throw. */
  alwaysFail?: boolean;
}

/** Deterministic provider for tests + local/e2e runs (no network, no spend). */
export class MockProvider implements AIProvider {
  readonly name: string;
  private calls = 0;

  constructor(private readonly opts: MockProviderOptions) {
    this.name = opts.name;
  }

  get callCount(): number {
    return this.calls;
  }

  async compose(_input: ComposeInput, _prompt: string): Promise<ProviderResult> {
    this.calls += 1;
    if (this.opts.alwaysFail || (this.opts.failTimes != null && this.calls <= this.opts.failTimes)) {
      throw new Error(`${this.name} failed (call ${this.calls})`);
    }
    // 1×1 transparent-ish PNG-sized placeholder bytes.
    return {
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      contentType: 'image/jpeg',
      model: this.opts.model ?? this.name,
      costCents: this.opts.costCents ?? 4,
      width: 1024,
      height: 1024,
    };
  }
}

/** Mock scene analyzer returning a fixed analysis. */
export class MockSceneProvider implements SceneProvider {
  async analyzeScene(_image: { url: string } | { bytes: Uint8Array }): Promise<SceneAnalysis> {
    return { lightDir: 'top-left', colorTempK: 4000, style: 'modern', surfaces: ['floor', 'wall'] };
  }
}

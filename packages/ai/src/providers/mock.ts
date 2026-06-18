import { neutralGenerationPlan, type GenerationPlan } from '@lumina/shared';
import type {
  AIProvider,
  BgRemovalProvider,
  ComposeInput,
  ImageRef,
  PlannerInput,
  PlannerProvider,
  ProviderResult,
  QuantityEstimate,
  QuantityInput,
  QuantityProvider,
} from '../types.js';

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

/**
 * Mock background remover: a fidelity-preserving no-op for offline/e2e. Returns the input bytes unchanged
 * (so product pixels are byte-identical), or a deterministic placeholder when given a url-only ref.
 */
export class MockBgRemovalProvider implements BgRemovalProvider {
  async removeBackground(image: ImageRef): Promise<{ bytes: Uint8Array; contentType: string }> {
    if ('bytes' in image) {
      return { bytes: image.bytes, contentType: image.contentType ?? 'image/png' };
    }
    return { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), contentType: 'image/png' };
  }
}

/**
 * Mock planner: the neutral `object_placement` plan for offline/e2e runs (no network, no spend) — exactly
 * the pre-planner behaviour (place the product once at the most natural location), so the offline pipeline
 * exercises the wiring without inventing facts.
 */
export class MockPlannerProvider implements PlannerProvider {
  async plan(_input: PlannerInput): Promise<GenerationPlan> {
    return neutralGenerationPlan();
  }
}

/** Mock coverage-quantity estimator returning a fixed estimate (tests + local/e2e). */
export class MockQuantityProvider implements QuantityProvider {
  readonly name = 'mock-quantity';
  private calls = 0;

  constructor(private readonly estimate?: Partial<QuantityEstimate>) {}

  get callCount(): number {
    return this.calls;
  }

  async estimateQuantity(_input: QuantityInput, _prompt: string): Promise<QuantityEstimate> {
    this.calls += 1;
    return {
      suggestedQuantity: 6,
      unit: 'panels',
      isCoverage: true,
      rationale: 'About 6 panels to cover the wall.',
      confidence: 0.8,
      ...this.estimate,
    };
  }
}

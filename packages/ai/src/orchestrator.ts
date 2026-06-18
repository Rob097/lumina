import type { GenerationPlan } from '@lumina/shared';
import { buildComposePrompt } from './prompt.js';
import { buildQuantityPrompt, isCoverageCategory, singleUnitEstimate } from './quantity.js';
import type {
  AIProvider,
  BgRemovalProvider,
  ComposeInput,
  ComposeResult,
  ImageRef,
  PlannerInput,
  PlannerProvider,
  QuantityEstimate,
  QuantityInput,
  QuantityProvider,
  RoutingPolicy,
} from './types.js';

export interface ProviderAttempt {
  provider: string;
  error: string;
}

/** Thrown when every provider in the policy chain has been exhausted. */
export class AIComposeError extends Error {
  constructor(
    message: string,
    public readonly attempts: ProviderAttempt[],
  ) {
    super(message);
    this.name = 'AIComposeError';
  }
}

export interface OrchestratorConfig {
  /** Ordered provider chain per routing policy (primary first, then fallbacks). */
  chains: Record<RoutingPolicy, AIProvider[]>;
  /** Attempts per provider before falling back (default 2). */
  retries?: number;
  /** Base backoff between retries in ms (default 250, exponential). */
  backoffMs?: number;
  bgRemoval?: BgRemovalProvider;
  /** The planner (§4.1): one reasoning pass over both images → a GenerationPlan. */
  planner?: PlannerProvider;
  /** Optional coverage-quantity estimator (§7 #7). */
  quantity?: QuantityProvider;
  /** Injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The single entrypoint for model calls (HARD RULE #8). Routes by policy to an ordered provider chain,
 * retries each provider with exponential backoff, and automatically falls back to the next provider.
 */
export class AIOrchestrator {
  constructor(private readonly config: OrchestratorConfig) {}

  async compose(input: ComposeInput): Promise<ComposeResult> {
    const chain = this.config.chains[input.policy];
    if (!chain || chain.length === 0) {
      throw new AIComposeError(`no providers configured for policy "${input.policy}"`, []);
    }
    const prompt = buildComposePrompt(input);
    const retries = this.config.retries ?? 2;
    const backoffMs = this.config.backoffMs ?? 250;
    const attempts: ProviderAttempt[] = [];

    for (const provider of chain) {
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        const start = Date.now();
        try {
          const result = await provider.compose(input, prompt);
          return { ...result, latencyMs: Date.now() - start };
        } catch (err) {
          attempts.push({ provider: provider.name, error: errorMessage(err) });
          if (attempt < retries) {
            await this.sleep(backoffMs * 2 ** (attempt - 1));
          }
        }
      }
    }
    throw new AIComposeError('all providers failed', attempts);
  }

  /**
   * The planner (§4.1): one reasoning pass over both images + product metadata → a GenerationPlan. Returns
   * null when no planner is configured. Best-effort handling (fallback to a neutral plan) lives in the caller.
   */
  async plan(input: PlannerInput): Promise<GenerationPlan | null> {
    if (!this.config.planner) {
      return null;
    }
    return this.config.planner.plan(input);
  }

  /**
   * Coverage-quantity estimate (§7 #7). Single-unit categories short-circuit to a trivial 1 with **no
   * model call** (cost/latency win, matches "shower/wardrobe = 1"). Coverage categories hit the provider;
   * returns null when none is configured. Provider errors propagate — the caller treats the estimate as
   * best-effort and never fails the generation over it.
   */
  async estimateQuantity(input: QuantityInput): Promise<QuantityEstimate | null> {
    if (!isCoverageCategory(input.category)) {
      return singleUnitEstimate();
    }
    if (!this.config.quantity) {
      return null;
    }
    return this.config.quantity.estimateQuantity(input, buildQuantityPrompt(input));
  }

  /** Optional product cutout (§7.4 step 2). Returns null when no provider is configured. */
  async bgRemoval(image: ImageRef): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!this.config.bgRemoval) {
      return null;
    }
    return this.config.bgRemoval.removeBackground(image);
  }

  private sleep(ms: number): Promise<void> {
    return (this.config.sleep ?? defaultSleep)(ms);
  }
}

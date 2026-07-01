import type { FashionPlacement, GenerationPlan } from '@lumina/shared';
import { buildComposePrompt } from './prompt.js';
import { buildQuantityPrompt, isCoverageCategory, singleUnitEstimate } from './quantity.js';
import type {
  AIProvider,
  BgRemovalProvider,
  ComposeInput,
  ComposeResult,
  ImageRef,
  PlacementDetectorInput,
  PlacementDetectorProvider,
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

/**
 * Thrown when a single model/network call exceeds its timeout and is aborted. This is the mechanism that
 * converts a *hung* gateway call into a thrown error the chain can react to: without it a hang blocks until
 * Vercel hard-kills the whole function (FUNCTION_INVOCATION_TIMEOUT) — a retry never fires, the fast→quality
 * fallback never runs, and the workflow can't refund gracefully (D-timeout). Best-effort callers
 * (planner/quantity/detector/bg-removal) catch it and degrade; compose folds it into `AIComposeError.attempts`.
 */
export class AITimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly timeoutMs: number,
  ) {
    super(`${label} call timed out after ${timeoutMs}ms`);
    this.name = 'AITimeoutError';
  }
}

export interface OrchestratorConfig {
  /** Ordered provider chain per routing policy (primary first, then fallbacks). */
  chains: Record<RoutingPolicy, AIProvider[]>;
  /** Attempts per provider before falling back (default 2). */
  retries?: number;
  /** Base backoff between retries in ms (default 250, exponential). */
  backoffMs?: number;
  /**
   * Timeouts (ms) that bound each model call so a hung provider can't run the Vercel function into its hard
   * `maxDuration` (→ FUNCTION_INVOCATION_TIMEOUT). Undefined ⇒ no timeout (the deterministic mock path / tests).
   * `composeAttemptTimeoutMs` caps a single compose attempt; `composeTotalTimeoutMs` caps the whole
   * retries+fallback loop so it always returns well under the caller's wall-clock budget. The best-effort
   * pre-passes have their own (shorter) caps.
   */
  composeAttemptTimeoutMs?: number;
  composeTotalTimeoutMs?: number;
  plannerTimeoutMs?: number;
  quantityTimeoutMs?: number;
  detectorTimeoutMs?: number;
  bgRemovalTimeoutMs?: number;
  bgRemoval?: BgRemovalProvider;
  /** The planner (§4.1): one reasoning pass over both images → a GenerationPlan. */
  planner?: PlannerProvider;
  /** Fashion placement detector — locates where/how to place the product, for deterministic size + position. */
  detector?: PlacementDetectorProvider;
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
    const attemptTimeout = this.config.composeAttemptTimeoutMs;
    const totalTimeout = this.config.composeTotalTimeoutMs;
    // Overall wall-clock ceiling across ALL providers + retries. A hung provider is aborted at the per-attempt
    // timeout (so the fallback still gets a turn), and the whole loop bails at the deadline — both throw an
    // AIComposeError the workflow refunds on, instead of letting a hang reach Vercel's hard 120s kill.
    const deadline = totalTimeout != null ? Date.now() + totalTimeout : Number.POSITIVE_INFINITY;
    const attempts: ProviderAttempt[] = [];

    for (const provider of chain) {
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          attempts.push({ provider: provider.name, error: 'compose deadline exceeded' });
          throw new AIComposeError('compose deadline exceeded', attempts);
        }
        // Per-attempt budget = the configured attempt cap, clamped to whatever is left of the overall deadline.
        const perAttempt =
          attemptTimeout != null
            ? totalTimeout != null
              ? Math.min(attemptTimeout, remaining)
              : attemptTimeout
            : totalTimeout != null
              ? remaining
              : undefined;
        const start = Date.now();
        try {
          const result = await this.withTimeout('compose', perAttempt, (signal) =>
            provider.compose(input, prompt, signal),
          );
          return { ...result, latencyMs: Date.now() - start };
        } catch (err) {
          attempts.push({ provider: provider.name, error: errorMessage(err) });
          if (attempt < retries) {
            const budgetLeft = deadline - Date.now();
            if (budgetLeft <= 0) break; // deadline spent → don't retry this provider; move on / throw
            await this.sleep(Math.min(backoffMs * 2 ** (attempt - 1), budgetLeft));
          }
        }
      }
    }
    throw new AIComposeError('all providers failed', attempts);
  }

  /**
   * Race a model call against a timeout. On timeout we abort the shared {@link AbortSignal} (so a
   * signal-aware provider actually cancels its HTTP request — no wasted gateway cost) and throw
   * {@link AITimeoutError}. `timeoutMs` undefined/≤0 ⇒ run the work unbounded (mock/test path). The timer is
   * always cleared so a completed call never keeps the event loop alive.
   */
  private async withTimeout<T>(
    label: string,
    timeoutMs: number | undefined,
    work: (signal?: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (timeoutMs == null || timeoutMs <= 0) {
      return work();
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AITimeoutError(label, timeoutMs));
      }, timeoutMs);
    });
    try {
      return await Promise.race([work(controller.signal), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * The planner (§4.1): one reasoning pass over both images + product metadata → a GenerationPlan. Returns
   * null when no planner is configured. Best-effort handling (fallback to a neutral plan) lives in the caller.
   */
  async plan(input: PlannerInput): Promise<GenerationPlan | null> {
    const planner = this.config.planner;
    if (!planner) {
      return null;
    }
    return this.withTimeout('planner', this.config.plannerTimeoutMs, () => planner.plan(input));
  }

  /**
   * Fashion placement detector: a cheap vision pass that locates where/how the product goes + a body-scale
   * reference, so the workflow can size + position it deterministically. Returns null when no detector is
   * configured. Best-effort handling (fallback to the plain generative path) lives in the caller.
   */
  async detectPlacement(input: PlacementDetectorInput): Promise<FashionPlacement | null> {
    const detector = this.config.detector;
    if (!detector) {
      return null;
    }
    return this.withTimeout('detector', this.config.detectorTimeoutMs, () => detector.detect(input));
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
    const quantity = this.config.quantity;
    if (!quantity) {
      return null;
    }
    return this.withTimeout('quantity', this.config.quantityTimeoutMs, () =>
      quantity.estimateQuantity(input, buildQuantityPrompt(input)),
    );
  }

  /** Optional product cutout (§7.4 step 2). Returns null when no provider is configured. */
  async bgRemoval(image: ImageRef): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const bgRemoval = this.config.bgRemoval;
    if (!bgRemoval) {
      return null;
    }
    return this.withTimeout('bg-removal', this.config.bgRemovalTimeoutMs, () =>
      bgRemoval.removeBackground(image),
    );
  }

  private sleep(ms: number): Promise<void> {
    return (this.config.sleep ?? defaultSleep)(ms);
  }
}

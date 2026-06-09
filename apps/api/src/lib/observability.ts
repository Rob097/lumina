/**
 * Observability seams (M5). Errors flow through `reportError` (Sentry is initialized at deploy via env;
 * structured console fallback here so call sites never change). Usage/ops events flow through an
 * `EventSink` to **Axiom** — powering the cost / margin / failure-rate dashboards — with a no-op console
 * fallback when Axiom isn't configured (local/tests), so nothing calls out without credentials.
 */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  console.error('[lumina:error]', {
    error: err instanceof Error ? err.message : String(err),
    ...context,
  });
}

export interface GenerationOutcome {
  generationId: string;
  merchantId: string;
  status: 'succeeded' | 'failed';
  model?: string | null;
  costCents?: number | null;
  latencyMs?: number | null;
  creditsSpent: number;
  errorCode?: string | null;
}

/** Shape a finished generation into a flat Axiom event (margin is derived downstream from cost). */
export function generationEvent(o: GenerationOutcome): Record<string, unknown> {
  return {
    event: 'generation.finished',
    generationId: o.generationId,
    merchantId: o.merchantId,
    status: o.status,
    model: o.model ?? null,
    costCents: o.costCents ?? null,
    latencyMs: o.latencyMs ?? null,
    creditsSpent: o.creditsSpent,
    errorCode: o.errorCode ?? null,
  };
}

export interface EventSink {
  /** Fire-and-forget structured event (never throws / blocks the caller). */
  track(fields: Record<string, unknown>): void;
}

/** Axiom-backed sink when `AXIOM_TOKEN` + `AXIOM_DATASET` are set, else a console no-op. */
export function createEventSink(env: Record<string, string | undefined>): EventSink {
  const token = env.AXIOM_TOKEN;
  const dataset = env.AXIOM_DATASET;
  if (!token || !dataset) {
    return {
      track: (fields) => {
        if (env.NODE_ENV !== 'test') console.log('[lumina:event]', fields);
      },
    };
  }
  // AXIOM_URL, when set, is the FULL ingest endpoint — e.g. an Axiom edge URL
  // (https://<region>.aws.edge.axiom.co/v1/ingest/<dataset>) that already includes the dataset and is
  // the only endpoint some region/token combos accept. Otherwise build the standard api.axiom.co URL.
  const url = env.AXIOM_URL ?? `https://api.axiom.co/v1/datasets/${dataset}/ingest`;
  return {
    track: (fields) => {
      void fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify([{ _time: new Date().toISOString(), ...fields }]),
      }).catch(() => {
        /* never let telemetry break the request */
      });
    },
  };
}

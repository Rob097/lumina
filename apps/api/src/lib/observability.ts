/**
 * Observability seams. Sentry (errors) and Axiom (usage events) are wired in M5; for now these are
 * structured-logging placeholders behind a stable interface so call sites don't change later.
 */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  console.error('[lumina:error]', {
    error: err instanceof Error ? err.message : String(err),
    ...context,
  });
}

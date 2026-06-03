/**
 * Lightweight error reporting (§3.1). When `PUBLIC_SENTRY_DSN` is set the widget posts a minimal event
 * tagged with the merchant's `site_key`; otherwise it's a no-op. A reporter must never throw — failures
 * to report are swallowed. The transport is injectable for tests.
 */
export interface ReportEvent {
  message: string;
  tags: Record<string, string>;
  extra?: Record<string, unknown>;
}

export type ReportTransport = (event: ReportEvent) => void;
export type Reporter = (error: unknown, context?: Record<string, unknown>) => void;

export interface ReporterOptions {
  dsn?: string;
  siteKey?: string;
  transport?: ReportTransport;
}

export function createReporter(options: ReporterOptions = {}): Reporter {
  if (!options.dsn) return () => {};
  const transport = options.transport ?? defaultTransport(options.dsn);
  const tags: Record<string, string> = {
    source: 'widget',
    ...(options.siteKey ? { site_key: options.siteKey } : {}),
  };

  return (error, context) => {
    try {
      transport({
        message: error instanceof Error ? error.message : String(error),
        tags,
        extra: context,
      });
    } catch {
      /* a reporter must never throw */
    }
  };
}

function defaultTransport(dsn: string): ReportTransport {
  const url = sentryStoreUrl(dsn);
  return (event) => {
    if (!url) return;
    try {
      const body = JSON.stringify(event);
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, body);
      } else if (typeof fetch !== 'undefined') {
        void fetch(url, { method: 'POST', body, keepalive: true });
      }
    } catch {
      /* ignore */
    }
  };
}

function sentryStoreUrl(dsn: string): string | undefined {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!projectId || !u.username) return undefined;
    return `${u.protocol}//${u.host}/api/${projectId}/store/?sentry_key=${u.username}`;
  } catch {
    return undefined;
  }
}

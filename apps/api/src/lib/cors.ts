import { URL } from 'node:url';

/**
 * Origin allow-listing for the public widget API (§3.9). A `site_key` is public by design but
 * domain-bound: requests whose `Origin` host isn't on the merchant's allow-list are rejected, and CORS
 * is reflected only for allowed origins.
 */

function hostnameFromOrigin(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function matchDomain(host: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === pattern;
}

export function isAllowedOrigin(origin: string | null, allowedDomains: readonly string[]): boolean {
  if (!origin) {
    return false;
  }
  const host = hostnameFromOrigin(origin);
  if (!host) {
    return false;
  }
  return allowedDomains.some((d) => matchDomain(host, d));
}

/** CORS headers reflecting a (already-validated) allowed origin. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Lumina-Key, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

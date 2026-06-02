import type { Database } from '@lumina/db';
import { resolveByPublishableKey, type ResolvedMerchant } from '@/lib/auth';
import { corsHeaders, isAllowedOrigin } from '@/lib/cors';
import { getDb } from '@/lib/db';
import { errorResponse } from '@/lib/http';

export interface WidgetContext {
  db: Database;
  merchant: ResolvedMerchant;
  merchantId: string;
  origin: string | null;
  /** CORS headers to attach to the response (empty if the origin isn't allowed). */
  cors: Record<string, string>;
}

export type WidgetGuard = { ok: true; ctx: WidgetContext } | { ok: false; response: Response };

/** Validate the publishable key + Origin (CORS) for a public widget request (§3.9). */
export async function requireWidgetAuth(request: Request): Promise<WidgetGuard> {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const db = getDb();
  const result = await resolveByPublishableKey(db, {
    headers: { get: (name) => request.headers.get(name) },
    query: url.searchParams,
    origin,
  });
  if (!result.ok) {
    const message = result.error === 'domain_not_allowed' ? 'Origin not allowed' : 'Invalid site key';
    return { ok: false, response: errorResponse(result.error, message) };
  }
  const cors =
    origin && isAllowedOrigin(origin, result.merchant.allowedDomains) ? corsHeaders(origin) : {};
  return {
    ok: true,
    ctx: { db, merchant: result.merchant, merchantId: result.merchantId, origin, cors },
  };
}

/** CORS preflight response — reflect the requesting Origin (the actual call still enforces the domain). */
export function widgetPreflight(request: Request): Response {
  const origin = request.headers.get('origin');
  return new Response(null, { status: 204, headers: origin ? corsHeaders(origin) : {} });
}

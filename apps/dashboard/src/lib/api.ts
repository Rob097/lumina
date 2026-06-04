import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  AnalyticsSummarySchema,
  ApiKeySummarySchema,
  CreditsResponseSchema,
  MeResponseSchema,
  TimeseriesResponseSchema,
  WidgetSettingsSchema,
  type AnalyticsSummary,
  type ApiKeySummary,
  type CreditsResponse,
  type MeResponse,
  type TimeseriesResponse,
  type WidgetSettings,
} from '@lumina/shared';

function apiBase(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

/** Server-side fetch to the LUMINA API, forwarding the caller's Supabase session cookies. */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${apiBase()}/api/v1${path}`, {
    ...init,
    headers: { cookie: cookieHeader, ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
}

/** Idempotent first-login bootstrap (creates merchant + keys on first call). */
export async function bootstrapMerchant(): Promise<void> {
  await apiFetch('/auth/bootstrap', { method: 'POST' });
}

export async function fetchMe(): Promise<MeResponse | null> {
  const res = await apiFetch('/me');
  if (!res.ok) {
    return null;
  }
  return MeResponseSchema.parse(await res.json());
}

export async function fetchKeys(): Promise<ApiKeySummary[]> {
  const res = await apiFetch('/keys');
  if (!res.ok) {
    return [];
  }
  return z.array(ApiKeySummarySchema).parse(await res.json());
}

export async function fetchDomains(): Promise<string[]> {
  const res = await apiFetch('/domains');
  if (!res.ok) {
    return [];
  }
  return z.object({ domains: z.array(z.string()) }).parse(await res.json()).domains;
}

export async function fetchCredits(): Promise<CreditsResponse | null> {
  const res = await apiFetch('/credits');
  if (!res.ok) {
    return null;
  }
  return CreditsResponseSchema.parse(await res.json());
}

export async function fetchWidgetConfig(): Promise<WidgetSettings | null> {
  const res = await apiFetch('/widget-config');
  if (!res.ok) {
    return null;
  }
  return WidgetSettingsSchema.parse(await res.json());
}

/** Persist the Widget Settings form. Returns the saved settings, or `null` on failure. */
export async function saveWidgetConfig(input: WidgetSettings): Promise<WidgetSettings | null> {
  const res = await apiFetch('/widget-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    return null;
  }
  return WidgetSettingsSchema.parse(await res.json());
}

function queryString(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function fetchAnalyticsSummary(
  range?: { from?: string; to?: string },
): Promise<AnalyticsSummary | null> {
  const res = await apiFetch(`/analytics/summary${queryString({ ...range })}`);
  if (!res.ok) {
    return null;
  }
  return AnalyticsSummarySchema.parse(await res.json());
}

export async function fetchAnalyticsTimeseries(
  params?: { from?: string; to?: string; interval?: string },
): Promise<TimeseriesResponse | null> {
  const res = await apiFetch(`/analytics/timeseries${queryString({ ...params })}`);
  if (!res.ok) {
    return null;
  }
  return TimeseriesResponseSchema.parse(await res.json());
}

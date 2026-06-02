import { cookies } from 'next/headers';
import { z } from 'zod';
import { ApiKeySummarySchema, MeResponseSchema, type ApiKeySummary, type MeResponse } from '@lumina/shared';

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

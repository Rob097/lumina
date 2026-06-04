import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  AnalyticsSummarySchema,
  ApiKeySummarySchema,
  BillingPlansResponseSchema,
  BulkProductsResultSchema,
  CreateKeyResponseSchema,
  CreditsResponseSchema,
  GenerationDetailSchema,
  GenerationsListResponseSchema,
  MeResponseSchema,
  ProductSchema,
  ProductsListResponseSchema,
  TeamResponseSchema,
  TimeseriesResponseSchema,
  WidgetSettingsSchema,
  type AnalyticsSummary,
  type ApiKeySummary,
  type BillingPlansResponse,
  type BulkProductsResult,
  type CreateKeyRequest,
  type CreateKeyResponse,
  type CreditsResponse,
  type GenerationDetail,
  type GenerationsListResponse,
  type Product,
  type ProductInput,
  type ProductUpdate,
  type ProductsListResponse,
  type MeResponse,
  type TeamMember,
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

/** Create an API key — the raw secret is returned exactly once (reveal-once). */
export async function createKey(req: CreateKeyRequest): Promise<CreateKeyResponse | null> {
  const res = await apiFetch('/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.ok ? CreateKeyResponseSchema.parse(await res.json()) : null;
}

export async function revokeKey(id: string): Promise<boolean> {
  const res = await apiFetch(`/keys/${id}`, { method: 'DELETE' });
  return res.ok;
}

export async function updateDomains(domains: string[]): Promise<string[] | null> {
  const res = await apiFetch('/domains', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domains }),
  });
  if (!res.ok) {
    return null;
  }
  return z.object({ domains: z.array(z.string()) }).parse(await res.json()).domains;
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const res = await apiFetch('/team');
  if (!res.ok) {
    return [];
  }
  return TeamResponseSchema.parse(await res.json()).members;
}

export async function updateMerchant(name: string): Promise<boolean> {
  const res = await apiFetch('/merchant', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.ok;
}

// ─────────────────────────────── billing ───────────────────────────────

export async function fetchBillingPlans(): Promise<BillingPlansResponse | null> {
  const res = await apiFetch('/billing/plans');
  return res.ok ? BillingPlansResponseSchema.parse(await res.json()) : null;
}

/** Start a Stripe Checkout for a plan; returns the redirect URL, or null. */
export async function startCheckout(plan: string): Promise<string | null> {
  const res = await apiFetch('/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) {
    return null;
  }
  return z.object({ checkoutUrl: z.string() }).parse(await res.json()).checkoutUrl;
}

/** Open the Stripe billing portal; returns the redirect URL, or null. */
export async function openBillingPortal(): Promise<string | null> {
  const res = await apiFetch('/billing/portal', { method: 'POST' });
  if (!res.ok) {
    return null;
  }
  return z.object({ portalUrl: z.string() }).parse(await res.json()).portalUrl;
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

// ─────────────────────────────── products ───────────────────────────────

export async function fetchProducts(
  params?: { category?: string; search?: string; includeArchived?: boolean },
): Promise<ProductsListResponse> {
  const res = await apiFetch(
    `/products${queryString({
      category: params?.category,
      search: params?.search,
      includeArchived: params?.includeArchived ? 'true' : undefined,
    })}`,
  );
  if (!res.ok) {
    return { products: [], total: 0 };
  }
  return ProductsListResponseSchema.parse(await res.json());
}

export async function createProduct(input: ProductInput): Promise<Product | null> {
  const res = await apiFetch('/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return res.ok ? ProductSchema.parse(await res.json()) : null;
}

export async function updateProduct(id: string, patch: ProductUpdate): Promise<Product | null> {
  const res = await apiFetch(`/products/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.ok ? ProductSchema.parse(await res.json()) : null;
}

export async function archiveProduct(id: string): Promise<boolean> {
  const res = await apiFetch(`/products/${id}`, { method: 'DELETE' });
  return res.ok;
}

export async function bulkUpsertProducts(products: ProductInput[]): Promise<BulkProductsResult | null> {
  const res = await apiFetch('/products/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ products }),
  });
  return res.ok ? BulkProductsResultSchema.parse(await res.json()) : null;
}

// ───────────────────────────── generations ─────────────────────────────

export async function fetchGenerations(
  params?: { status?: string; productId?: string; cursor?: string; limit?: string },
): Promise<GenerationsListResponse> {
  const res = await apiFetch(`/generations${queryString({ ...params })}`);
  if (!res.ok) {
    return { items: [], nextCursor: null };
  }
  return GenerationsListResponseSchema.parse(await res.json());
}

export async function fetchGeneration(id: string): Promise<GenerationDetail | null> {
  const res = await apiFetch(`/generations/${id}`);
  return res.ok ? GenerationDetailSchema.parse(await res.json()) : null;
}

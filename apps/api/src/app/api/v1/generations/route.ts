import { GenerationStatusSchema, GenerateResponseSchema, StudioGenerateRequestSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { generationImageDeps } from '@/lib/generations/images';
import { listGenerations } from '@/lib/generations/service';
import { getClient } from '@/lib/clients/service';
import {
  createGeneration,
  InsufficientCreditsError,
  ProductNotFoundError,
  type GenerateDeps,
} from '@/lib/generate/service';
import { inngest } from '@/lib/inngest/client';
import { createR2FromEnv } from '@/lib/storage/r2';
import { emailSenderFromEnv } from '@/lib/email';
import { notifyMerchant } from '@/lib/notifications/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /v1/generations — the merchant's generations, newest-first, cursor-paginated (§6.3). */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const status = statusParam ? GenerationStatusSchema.safeParse(statusParam) : null;
  const sourceParam = url.searchParams.get('source');
  const source = sourceParam === 'studio' || sourceParam === 'widget' ? sourceParam : undefined;

  const result = await listGenerations(
    guard.db,
    guard.merchantId,
    {
      status: status?.success ? status.data : undefined,
      productId: url.searchParams.get('productId') ?? undefined,
      clientId: url.searchParams.get('clientId') ?? undefined,
      source,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
    },
    generationImageDeps(),
  );
  return jsonResponse(result);
}

/**
 * POST /v1/generations — the authenticated Studio generate entrypoint (#8). Reuses `createGeneration`
 * (atomic credit debit + Inngest workflow) exactly like the widget; references the product by internal
 * uuid and optionally links a client.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = StudioGenerateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid generate request');
  }
  const req = parsed.data;

  // Tenant isolation: a linked client must belong to this merchant (the privileged role bypasses RLS).
  if (req.clientId && !(await getClient(guard.db, guard.merchantId, req.clientId))) {
    return errorResponse('not_found', 'Client not found');
  }

  const storage = createR2FromEnv(process.env);
  const email = emailSenderFromEnv(process.env);
  const deps: GenerateDeps = {
    enqueue: async (event) => {
      await inngest.send(event);
    },
    signResult: async (key) => (storage ? storage.presignDownload(key) : `/${key}`),
    notify: (input) => notifyMerchant(guard.db, { email }, input),
  };

  try {
    const result = await createGeneration(guard.db, deps, {
      merchantId: guard.merchantId,
      productUuid: req.productId,
      roomKey: req.roomKey,
      clientId: req.clientId,
      placementHint: req.placementHint,
      customInstructions: req.customInstructions,
      metadata: { source: 'studio' },
    });
    const core = GenerateResponseSchema.parse({
      generationId: result.generationId,
      status: result.status,
    });
    return jsonResponse(
      { ...core, cached: result.cached, ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}) },
      { status: result.status === 'queued' ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return errorResponse('insufficient_credits', 'Out of credits');
    }
    if (err instanceof ProductNotFoundError) {
      return errorResponse('not_found', 'Product not found');
    }
    throw err;
  }
}

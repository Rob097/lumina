import { GenerateRequestSchema, GenerateResponseSchema } from '@lumina/shared';
import {
  createGeneration,
  InsufficientCreditsError,
  ProductNotFoundError,
  type GenerateDeps,
} from '@/lib/generate/service';
import { errorResponse, jsonResponse } from '@/lib/http';
import { inngest } from '@/lib/inngest/client';
import { createRateLimiter } from '@/lib/ratelimit';
import { createR2FromEnv } from '@/lib/storage/r2';
import { requireWidgetAuth, widgetPreflight } from '@/lib/widget-guard';

export const runtime = 'nodejs';

export function OPTIONS(request: Request): Response {
  return widgetPreflight(request);
}

export async function POST(request: Request): Promise<Response> {
  const guard = await requireWidgetAuth(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { db, merchantId, cors } = guard.ctx;

  const parsed = GenerateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid generate request', cors);
  }
  const req = parsed.data;

  // Rate limit per site key + per-anonymous-visitor daily cap (credit-drain protection).
  const limiter = createRateLimiter(process.env);
  if (!(await limiter.checkKey(merchantId))) {
    return errorResponse('rate_limited', 'Rate limit exceeded', cors);
  }
  if (!(await limiter.checkAnon(req.anonId))) {
    return errorResponse('rate_limited', 'Daily limit reached', cors);
  }

  const storage = createR2FromEnv(process.env);
  const deps: GenerateDeps = {
    enqueue: async (event) => {
      await inngest.send(event);
    },
    signResult: async (key) => (storage ? storage.presignDownload(key) : `/${key}`),
  };

  try {
    const result = await createGeneration(db, deps, {
      merchantId,
      productId: req.productId,
      inlineProduct: req.product,
      roomKey: req.roomKey,
      placementHint: req.placementHint,
      customInstructions: req.customInstructions,
      anonId: req.anonId,
      pageUrl: req.pageUrl,
      metadata: req.metadata,
    });
    const core = GenerateResponseSchema.parse({
      generationId: result.generationId,
      status: result.status,
    });
    return jsonResponse(
      { ...core, cached: result.cached, ...(result.resultUrl ? { resultUrl: result.resultUrl } : {}) },
      { status: result.status === 'queued' ? 201 : 200, headers: cors },
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return errorResponse('insufficient_credits', 'Out of credits', cors);
    }
    if (err instanceof ProductNotFoundError) {
      return errorResponse('not_found', 'Product not found', cors);
    }
    throw err;
  }
}

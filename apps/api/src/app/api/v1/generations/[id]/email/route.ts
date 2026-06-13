import { EmailResultRequestSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { emailGenerationResult } from '@/lib/generations/email';
import { emailSenderFromEnv } from '@/lib/email';
import { createR2FromEnv } from '@/lib/storage/r2';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /v1/generations/:id/email — email a finished Studio render to a client (#8). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return errorResponse('not_found', 'Generation not found');
  }
  const parsed = EmailResultRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid request');
  }

  const storage = createR2FromEnv(process.env);
  const outcome = await emailGenerationResult(
    guard.db,
    {
      presignDownload: storage ? (key, ttl) => storage.presignDownload(key, ttl) : null,
      sender: emailSenderFromEnv(process.env),
    },
    { merchantId: guard.merchantId, generationId: id, email: parsed.data.email },
  );

  if (!outcome.ok) {
    if (outcome.reason === 'not_found') {
      return errorResponse('not_found', 'Generation not found');
    }
    if (outcome.reason === 'no_recipient') {
      return errorResponse('invalid_input', 'No email address for this client');
    }
    if (outcome.reason === 'not_ready') {
      return errorResponse('invalid_input', 'The render is not ready yet');
    }
    return serverError('Email is not available');
  }
  return jsonResponse({ ok: true, email: outcome.email });
}

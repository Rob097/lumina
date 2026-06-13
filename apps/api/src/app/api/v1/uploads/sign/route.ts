import { randomUUID } from 'node:crypto';
import { SignUploadRequestSchema, SignUploadResponseSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { roomKey } from '@/lib/storage/keys';
import { createR2FromEnv } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /v1/uploads/sign — authenticated (Studio, #8) presigned R2 room upload. Mirrors the widget's
 * `sign-upload` but behind a merchant session instead of a site key; the key stays `{merchant_id}/`.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = SignUploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid sign-upload request');
  }
  const storage = createR2FromEnv(process.env);
  if (!storage) {
    return serverError('Storage is not configured');
  }
  const key = roomKey(guard.merchantId, randomUUID());
  const expiresIn = 600;
  const uploadUrl = await storage.presignUpload(key, parsed.data.contentType, expiresIn);
  return jsonResponse(SignUploadResponseSchema.parse({ uploadUrl, roomKey: key, expiresIn }));
}

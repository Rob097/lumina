import { randomUUID } from 'node:crypto';
import { SignGuideUploadRequestSchema, SignGuideUploadResponseSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { guideImageExt, guideKey } from '@/lib/storage/keys';
import { createR2FromEnv } from '@/lib/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /v1/uploads/guide — authenticated presigned R2 PUT for the merchant's pre-upload guide image. The
 * browser PUTs the file straight to R2 (no server hop); we return a STABLE public URL (served by the guide
 * proxy route, `/v1/widget/guide/{merchantId}/{file}`) to store in the widget config. The key stays
 * `guides/{merchant_id}/` (HARD RULE #1). Only real image types are accepted.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = SignGuideUploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid guide-upload request');
  }
  const ext = guideImageExt(parsed.data.contentType);
  if (!ext) {
    return errorResponse('invalid_input', 'Unsupported image type (use PNG, JPEG or WebP)');
  }
  const storage = createR2FromEnv(process.env);
  if (!storage) {
    return serverError('Storage is not configured');
  }
  const id = randomUUID();
  const key = guideKey(guard.merchantId, id, ext);
  const expiresIn = 600;
  const uploadUrl = await storage.presignUpload(key, parsed.data.contentType, expiresIn);
  const origin = new URL(request.url).origin;
  const publicUrl = `${origin}/api/v1/widget/guide/${guard.merchantId}/${id}.${ext}`;
  return jsonResponse(SignGuideUploadResponseSchema.parse({ uploadUrl, publicUrl, expiresIn }));
}

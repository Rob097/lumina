import { randomUUID } from 'node:crypto';
import { SignUploadRequestSchema, SignUploadResponseSchema } from '@lumina/shared';
import { errorResponse, jsonResponse, serverError } from '@/lib/http';
import { roomKey } from '@/lib/storage/keys';
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
  const { merchantId, cors } = guard.ctx;

  const parsed = SignUploadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid sign-upload request', cors);
  }
  const storage = createR2FromEnv(process.env);
  if (!storage) {
    return serverError('Storage is not configured');
  }
  const key = roomKey(merchantId, randomUUID());
  const expiresIn = 600;
  const uploadUrl = await storage.presignUpload(key, parsed.data.contentType, expiresIn);
  const body = SignUploadResponseSchema.parse({ uploadUrl, roomKey: key, expiresIn });
  return jsonResponse(body, { headers: cors });
}

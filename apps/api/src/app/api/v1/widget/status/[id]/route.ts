import { and, eq } from 'drizzle-orm';
import { generations } from '@lumina/db';
import { StatusResponseSchema } from '@lumina/shared';
import { errorResponse, jsonResponse } from '@/lib/http';
import { createR2FromEnv } from '@/lib/storage/r2';
import { isUuid } from '@/lib/uuid';
import { requireWidgetAuth, widgetPreflight } from '@/lib/widget-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request: Request): Response {
  return widgetPreflight(request);
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireWidgetAuth(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { db, merchantId, cors } = guard.ctx;
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return errorResponse('not_found', 'Generation not found', cors);
  }

  const rows = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.merchantId, merchantId)))
    .limit(1);
  const gen = rows[0];
  if (!gen) {
    return errorResponse('not_found', 'Generation not found', cors);
  }

  const storage = createR2FromEnv(process.env);
  const resultUrl = gen.resultKey && storage ? await storage.presignDownload(gen.resultKey) : undefined;
  const beforeUrl = storage ? await storage.presignDownload(gen.roomKey) : undefined;

  const body = StatusResponseSchema.parse({
    id: gen.id,
    status: gen.status,
    ...(resultUrl ? { resultUrl } : {}),
    ...(beforeUrl ? { beforeUrl } : {}),
    ...(gen.status === 'failed'
      ? { error: { code: 'generation_failed', message: 'Generation failed' } }
      : {}),
  });
  return jsonResponse(body, { headers: cors });
}

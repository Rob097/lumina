import { and, eq } from 'drizzle-orm';
import { generations, usageEvents } from '@lumina/db';
import { FeedbackRequestSchema } from '@lumina/shared';
import { errorResponse, noContent } from '@/lib/http';
import { isUuid } from '@/lib/uuid';
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

  const parsed = FeedbackRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isUuid(parsed.data.generationId)) {
    return errorResponse('invalid_input', 'Invalid feedback', cors);
  }
  const { generationId, rating, comment } = parsed.data;

  const owned = await db
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.merchantId, merchantId)))
    .limit(1);
  if (!owned[0]) {
    return errorResponse('not_found', 'Generation not found', cors);
  }

  await db.insert(usageEvents).values({
    merchantId,
    type: 'feedback',
    generationId,
    props: { rating, comment: comment ?? null },
  });
  return noContent(cors);
}

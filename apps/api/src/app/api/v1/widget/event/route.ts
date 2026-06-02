import { usageEvents } from '@lumina/db';
import { EventBeaconRequestSchema } from '@lumina/shared';
import { errorResponse, noContent } from '@/lib/http';
import { asUuid } from '@/lib/uuid';
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

  const parsed = EventBeaconRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid event', cors);
  }
  const e = parsed.data;
  await db.insert(usageEvents).values({
    merchantId,
    type: e.type,
    productId: asUuid(e.productId),
    generationId: asUuid(e.generationId),
    anonId: e.anonId,
    props: e.props ?? {},
  });
  return noContent(cors);
}

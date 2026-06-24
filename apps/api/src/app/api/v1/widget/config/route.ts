import { and, eq } from 'drizzle-orm';
import { widgetConfigs } from '@lumina/db';
import {
  DEFAULT_LOCALE,
  LocaleSchema,
  ThemeSchema,
  WidgetConfigResponseSchema,
} from '@lumina/shared';
import { jsonResponse } from '@/lib/http';
import { requireWidgetAuth, widgetPreflight } from '@/lib/widget-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(request: Request): Response {
  return widgetPreflight(request);
}

export async function GET(request: Request): Promise<Response> {
  const guard = await requireWidgetAuth(request);
  if (!guard.ok) {
    return guard.response;
  }
  const { db, merchantId, cors } = guard.ctx;

  const rows = await db
    .select()
    .from(widgetConfigs)
    .where(and(eq(widgetConfigs.merchantId, merchantId), eq(widgetConfigs.isActive, true)))
    .limit(1);
  const cfg = rows[0];

  const locale = LocaleSchema.safeParse(cfg?.locale ?? DEFAULT_LOCALE);
  const body = WidgetConfigResponseSchema.parse({
    enabled: true,
    theme: ThemeSchema.parse(cfg?.theme ?? {}),
    buttonText: cfg?.buttonText ?? 'Try in your room',
    locale: locale.success ? locale.data : DEFAULT_LOCALE,
    i18n: cfg?.i18n ?? {},
    watermark: cfg?.watermark ?? true,
    limits: {
      anonDailyCap: Number(process.env.ANON_DAILY_CAP ?? 5),
      maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10_485_760),
      maxImageEdgePx: 2048,
    },
    resultCta: cfg?.resultCta ?? null,
    // Pre-upload guide is shopper-facing config (image is a plain hosted URL); only surface it when enabled.
    guide: cfg?.guide && cfg.guide.enabled && cfg.guide.imageUrl ? cfg.guide : null,
  });
  return jsonResponse(body, { headers: cors });
}

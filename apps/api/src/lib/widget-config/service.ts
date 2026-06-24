import { and, eq } from 'drizzle-orm';
import { widgetConfigs, type Database } from '@lumina/db';
import {
  DEFAULT_LOCALE,
  LocaleSchema,
  WidgetSettingsSchema,
  WidgetThemeSettingsSchema,
  type WidgetSettings,
} from '@lumina/shared';

/**
 * Widget configuration for the Widget Settings screen (§6.3 `/widget-config`). Reads/writes the
 * merchant's single **active** `widget_configs` row; the public `GET /v1/widget/config` derives the
 * shopper-facing response from the same row. Every query is scoped by `merchant_id` (HARD RULE #1).
 */

const DEFAULTS: WidgetSettings = {
  buttonText: 'Try in your room',
  theme: {},
  locale: DEFAULT_LOCALE,
  i18n: {},
  watermark: true,
  resultCta: null,
  guide: null,
};

/** Coerce a stored (permissive) `widget_configs` row into the validated settings shape. */
function toSettings(row: typeof widgetConfigs.$inferSelect): WidgetSettings {
  const locale = LocaleSchema.safeParse(row.locale);
  const theme = WidgetThemeSettingsSchema.safeParse(row.theme ?? {});
  return {
    buttonText: row.buttonText,
    theme: theme.success ? theme.data : {},
    locale: locale.success ? locale.data : DEFAULT_LOCALE,
    i18n: row.i18n ?? {},
    watermark: row.watermark,
    resultCta: row.resultCta ?? null,
    guide: row.guide ?? null,
  };
}

export async function getWidgetSettings(
  db: Database,
  merchantId: string,
): Promise<WidgetSettings> {
  const [row] = await db
    .select()
    .from(widgetConfigs)
    .where(and(eq(widgetConfigs.merchantId, merchantId), eq(widgetConfigs.isActive, true)))
    .limit(1);
  return row ? toSettings(row) : DEFAULTS;
}

/** Upsert the merchant's active config row, keeping exactly one active row (widget_active_uidx). */
export async function saveWidgetSettings(
  db: Database,
  merchantId: string,
  input: WidgetSettings,
): Promise<WidgetSettings> {
  const settings = WidgetSettingsSchema.parse(input);
  const values = {
    buttonText: settings.buttonText,
    locale: settings.locale,
    theme: settings.theme,
    i18n: settings.i18n,
    resultCta: settings.resultCta,
    guide: settings.guide ?? null,
    watermark: settings.watermark,
  };

  const [existing] = await db
    .select({ id: widgetConfigs.id })
    .from(widgetConfigs)
    .where(and(eq(widgetConfigs.merchantId, merchantId), eq(widgetConfigs.isActive, true)))
    .limit(1);

  if (existing) {
    await db.update(widgetConfigs).set(values).where(eq(widgetConfigs.id, existing.id));
  } else {
    await db.insert(widgetConfigs).values({ merchantId, isActive: true, ...values });
  }
  return settings;
}

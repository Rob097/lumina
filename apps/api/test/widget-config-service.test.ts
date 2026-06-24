import { randomUUID } from 'node:crypto';
import { merchants, widgetConfigs } from '@lumina/db';
import { firstOrThrow, setupTestDb, type TestDb } from '@lumina/db/testing';
import type { WidgetSettings } from '@lumina/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getWidgetSettings, saveWidgetSettings } from '../src/lib/widget-config/service.js';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await setupTestDb();
});

afterAll(async () => {
  await ctx?.teardown();
});

async function newMerchant(): Promise<string> {
  const rows = await ctx.db
    .insert(merchants)
    .values({ name: 'Co', slug: `co-${randomUUID()}`, plan: 'growth' })
    .returning();
  return firstOrThrow(rows).id;
}

const SETTINGS: WidgetSettings = {
  buttonText: 'See it in your space',
  theme: { accent: '#0b7d83', mode: 'dark', radius: 8, fontFamily: 'Georgia, serif' },
  locale: 'it',
  i18n: { 'upload.title': 'Carica una foto' },
  watermark: false,
  resultCta: { label: 'Aggiungi al carrello', urlTemplate: '/cart/add?id={productId}' },
  guide: { enabled: true, imageUrl: 'https://cdn.test/pose.png', title: 'Pose like this' },
};

describe('getWidgetSettings', () => {
  it('returns sane defaults when the merchant has no config row', async () => {
    const m = await newMerchant();
    const cfg = await getWidgetSettings(ctx.db, m);
    expect(cfg.buttonText).toBe('Try in your room');
    expect(cfg.locale).toBe('en');
    expect(cfg.watermark).toBe(true);
    expect(cfg.resultCta).toBeNull();
    expect(cfg.i18n).toEqual({});
  });
});

describe('saveWidgetSettings', () => {
  it('inserts the active config row, then updates it in place on a second save', async () => {
    const m = await newMerchant();

    const saved = await saveWidgetSettings(ctx.db, m, SETTINGS);
    expect(saved).toEqual(SETTINGS);
    expect(await getWidgetSettings(ctx.db, m)).toEqual(SETTINGS);

    const next: WidgetSettings = { ...SETTINGS, buttonText: 'Provalo ora', watermark: true };
    await saveWidgetSettings(ctx.db, m, next);

    // exactly one active row survives — no duplicate that would trip widget_active_uidx
    const rows = await ctx.db
      .select()
      .from(widgetConfigs)
      .where(and(eq(widgetConfigs.merchantId, m), eq(widgetConfigs.isActive, true)));
    expect(rows).toHaveLength(1);
    expect((await getWidgetSettings(ctx.db, m)).buttonText).toBe('Provalo ora');
  });

  it('scopes strictly to the merchant — saving for A never touches B', async () => {
    const a = await newMerchant();
    const b = await newMerchant();
    await saveWidgetSettings(ctx.db, a, SETTINGS);

    const vb = await getWidgetSettings(ctx.db, b);
    expect(vb.buttonText).toBe('Try in your room');
    expect(vb.locale).toBe('en');
  });
});

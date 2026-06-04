'use server';

import { revalidatePath } from 'next/cache';
import { WidgetSettingsSchema, type WidgetSettings } from '@lumina/shared';
import { saveWidgetConfig } from '@/lib/api';

export type SaveResult = { ok: true; settings: WidgetSettings } | { ok: false; error: string };

/** Persist the Widget Settings form via the merchant API (cookie-forwarded), then revalidate. */
export async function saveWidgetSettingsAction(input: unknown): Promise<SaveResult> {
  const parsed = WidgetSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Some settings are invalid. Please review and try again.' };
  }
  const saved = await saveWidgetConfig(parsed.data);
  if (!saved) {
    return { ok: false, error: "Couldn't save your changes. Please try again." };
  }
  revalidatePath('/widget');
  return { ok: true, settings: saved };
}

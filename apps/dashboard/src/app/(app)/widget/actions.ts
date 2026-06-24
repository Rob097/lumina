'use server';

import { revalidatePath } from 'next/cache';
import { WidgetSettingsSchema, type WidgetSettings } from '@lumina/shared';
import { saveWidgetConfig, signGuideUpload } from '@/lib/api';

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

/**
 * Presign a guide-image upload for the Widget Settings editor. The browser then PUTs the file straight to R2
 * and stores the returned `publicUrl` as the guide image. Returns null on failure.
 */
export async function signGuideUploadAction(contentType: string): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  return signGuideUpload(contentType);
}

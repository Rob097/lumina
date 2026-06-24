'use server';

import { SupportRequestSchema } from '@lumina/shared';
import { submitSupport } from '@/lib/api';

export type SupportActionResult = { ok: true } | { ok: false; error: string };

/** Validate + relay a support request to the API (which emails the YuzuView team). */
export async function submitSupportAction(input: unknown): Promise<SupportActionResult> {
  const parsed = SupportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Add a subject (3+ chars) and a message (10+ chars).' };
  }
  const ok = await submitSupport(parsed.data);
  if (!ok) {
    return { ok: false, error: "Couldn't send your request. Please try again in a moment." };
  }
  return { ok: true };
}

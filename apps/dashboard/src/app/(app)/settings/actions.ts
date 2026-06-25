'use server';

import { revalidatePath } from 'next/cache';
import {
  CreateKeyRequestSchema,
  DomainsSchema,
  MerchantUpdateSchema,
  type ApiKeySummary,
  type CreateKeyResponse,
  type RegenerateKeysResponse,
} from '@lumina/shared';
import {
  createKey,
  deleteMerchant,
  fetchKeys,
  regenerateKeys,
  revokeKey,
  updateDomains,
  updateMerchant,
} from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function renameMerchantAction(name: unknown): Promise<ActionResult> {
  const parsed = MerchantUpdateSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, error: 'Enter a name between 1 and 80 characters.' };
  }
  const ok = await updateMerchant(parsed.data.name);
  if (!ok) {
    return { ok: false, error: "Couldn't update the name." };
  }
  revalidatePath('/settings');
  return { ok: true, data: undefined };
}

export async function createKeyAction(input: unknown): Promise<ActionResult<CreateKeyResponse>> {
  const parsed = CreateKeyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Choose a valid key type and environment.' };
  }
  const created = await createKey(parsed.data);
  if (!created) {
    return { ok: false, error: "Couldn't create the key." };
  }
  revalidatePath('/settings');
  return { ok: true, data: created };
}

export async function revokeKeyAction(id: string): Promise<ActionResult> {
  const ok = await revokeKey(id);
  if (!ok) {
    return { ok: false, error: "Couldn't revoke the key." };
  }
  revalidatePath('/settings');
  return { ok: true, data: undefined };
}

/** Replace the live publishable + secret pair; both raw values are revealed once to the caller. */
export async function regenerateKeysAction(): Promise<ActionResult<RegenerateKeysResponse>> {
  const created = await regenerateKeys();
  if (!created) {
    return { ok: false, error: "Couldn't regenerate the keys. Please try again." };
  }
  revalidatePath('/settings');
  return { ok: true, data: created };
}

export async function listKeysAction(): Promise<ApiKeySummary[]> {
  return fetchKeys();
}

/** Owner-only GDPR erasure: delete the workspace + all data, then sign out. */
export async function deleteAccountAction(): Promise<ActionResult> {
  const ok = await deleteMerchant();
  if (!ok) {
    return { ok: false, error: "Couldn't delete the workspace. Only the owner can do this." };
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return { ok: true, data: undefined };
}

export async function saveDomainsAction(domains: unknown): Promise<ActionResult<string[]>> {
  const parsed = DomainsSchema.safeParse({ domains });
  if (!parsed.success) {
    return { ok: false, error: 'One or more domains are invalid hostnames.' };
  }
  const saved = await updateDomains(parsed.data.domains);
  if (!saved) {
    return { ok: false, error: "Couldn't save domains." };
  }
  revalidatePath('/settings');
  return { ok: true, data: saved };
}

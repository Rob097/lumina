'use server';

import { revalidatePath } from 'next/cache';
import {
  CreateKeyRequestSchema,
  DomainsSchema,
  MerchantUpdateSchema,
  type ApiKeySummary,
  type CreateKeyResponse,
} from '@lumina/shared';
import { createKey, fetchKeys, revokeKey, updateDomains, updateMerchant } from '@/lib/api';

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

export async function listKeysAction(): Promise<ApiKeySummary[]> {
  return fetchKeys();
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

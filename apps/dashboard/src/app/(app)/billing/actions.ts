'use server';

import { PlanTierSchema } from '@lumina/shared';
import { openBillingPortal, startCheckout } from '@/lib/api';

export type RedirectResult = { ok: true; url: string } | { ok: false; error: string };

export async function checkoutAction(plan: unknown): Promise<RedirectResult> {
  const parsed = PlanTierSchema.safeParse(plan);
  if (!parsed.success) {
    return { ok: false, error: 'Unknown plan.' };
  }
  const url = await startCheckout(parsed.data);
  if (!url) {
    return { ok: false, error: 'Billing is not configured yet. Try again later.' };
  }
  return { ok: true, url };
}

export async function portalAction(): Promise<RedirectResult> {
  const url = await openBillingPortal();
  if (!url) {
    return { ok: false, error: 'Billing is not configured yet. Try again later.' };
  }
  return { ok: true, url };
}

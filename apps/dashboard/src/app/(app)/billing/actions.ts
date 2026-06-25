'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { PlanChangeRequestSchema, PlanTierSchema } from '@lumina/shared';
import { changePlan, openBillingPortal, startCheckout } from '@/lib/api';
import { ACTIVE_MERCHANT_COOKIE } from '@/lib/workspace';

export type RedirectResult = { ok: true; url: string } | { ok: false; error: string };
export type ChangeResult = { ok: true } | { ok: false; error: string };

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

/**
 * Downgrade the account's plan (in place — no redirect). When the downgrade deactivates the active
 * workspace, the API returns which kept shop to switch into and we move the cookie there before the
 * dashboard re-reads. accounts.plan updates once the Stripe webhook lands (refresh shows it).
 */
export async function changeAction(
  targetPlan: unknown,
  keepMerchantIds?: unknown,
): Promise<ChangeResult> {
  const parsed = PlanChangeRequestSchema.safeParse({
    targetPlan,
    ...(Array.isArray(keepMerchantIds) ? { keepMerchantIds } : {}),
  });
  if (!parsed.success) {
    return { ok: false, error: 'Invalid plan change.' };
  }
  const res = await changePlan(parsed.data);
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  if (res.activeMerchantReset) {
    (await cookies()).set(ACTIVE_MERCHANT_COOKIE, res.activeMerchantReset, COOKIE_OPTS);
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function checkoutAction(plan: unknown): Promise<RedirectResult> {
  const parsed = PlanTierSchema.safeParse(plan);
  if (!parsed.success) {
    return { ok: false, error: 'Unknown plan.' };
  }
  const result = await startCheckout(parsed.data);
  if ('error' in result) {
    return { ok: false, error: result.error };
  }
  return { ok: true, url: result.url };
}

export async function portalAction(): Promise<RedirectResult> {
  const url = await openBillingPortal();
  if (!url) {
    return { ok: false, error: 'Billing is not configured yet. Try again later.' };
  }
  return { ok: true, url };
}

'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { CreateWorkspaceSchema } from '@lumina/shared';
import { acceptInvite, createWorkspace, fetchMe, reactivateWorkspace } from '@/lib/api';
import { ACTIVE_MERCHANT_COOKIE } from '@/lib/workspace';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};

export type WorkspaceActionResult = { ok: true } | { ok: false; error: string };

/** Switch the active workspace (validated against the user's memberships before setting the cookie). */
export async function switchWorkspaceAction(merchantId: string): Promise<WorkspaceActionResult> {
  const me = await fetchMe();
  if (!me || !me.merchants.some((m) => m.id === merchantId)) {
    return { ok: false, error: 'You are not a member of that workspace.' };
  }
  (await cookies()).set(ACTIVE_MERCHANT_COOKIE, merchantId, COOKIE_OPTS);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Create a new workspace and switch into it. */
export async function createWorkspaceAction(name: unknown): Promise<WorkspaceActionResult> {
  const parsed = CreateWorkspaceSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, error: 'Enter a workspace name (1–80 characters).' };
  }
  const created = await createWorkspace(parsed.data.name);
  if (!created.ok) {
    return { ok: false, error: created.error };
  }
  (await cookies()).set(ACTIVE_MERCHANT_COOKIE, created.workspace.id, COOKIE_OPTS);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Re-activate a deactivated workspace (if under the plan's active-shop cap). */
export async function reactivateWorkspaceAction(merchantId: string): Promise<WorkspaceActionResult> {
  const res = await reactivateWorkspace(merchantId);
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Accept a team invitation by token, then switch into the joined workspace. */
export async function acceptInviteAction(token: string): Promise<WorkspaceActionResult> {
  const merchantId = await acceptInvite(token);
  if (!merchantId) {
    return { ok: false, error: 'This invitation is invalid, expired, or already used.' };
  }
  (await cookies()).set(ACTIVE_MERCHANT_COOKIE, merchantId, COOKIE_OPTS);
  revalidatePath('/', 'layout');
  return { ok: true };
}

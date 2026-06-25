'use server';

import { revalidatePath } from 'next/cache';
import { CreateInviteSchema, type InvitationSummary } from '@lumina/shared';
import { createInvite, revokeInvite } from '@/lib/api';

export type InviteResult =
  | { ok: true; invitation: InvitationSummary }
  | { ok: false; error: string };

/** Invite a teammate by email. Everyone joins as a plain `member` (role is fixed, not chosen). */
export async function inviteTeammateAction(input: { email: string }): Promise<InviteResult> {
  const parsed = CreateInviteSchema.safeParse({ email: input.email, role: 'member' });
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  const invitation = await createInvite(parsed.data);
  if (!invitation) {
    return { ok: false, error: "Couldn't send the invitation. Only owners can invite." };
  }
  revalidatePath('/settings');
  return { ok: true, invitation };
}

export async function revokeInviteAction(id: string): Promise<{ ok: boolean }> {
  const ok = await revokeInvite(id);
  if (ok) revalidatePath('/settings');
  return { ok };
}

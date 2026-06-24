'use server';

import { revalidatePath } from 'next/cache';
import { CreateInviteSchema, type InvitableRole, type InvitationSummary } from '@lumina/shared';
import { createInvite, revokeInvite } from '@/lib/api';

export type InviteResult =
  | { ok: true; invitation: InvitationSummary }
  | { ok: false; error: string };

export async function inviteTeammateAction(input: {
  email: string;
  role: InvitableRole;
}): Promise<InviteResult> {
  const parsed = CreateInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid email and role.' };
  }
  const invitation = await createInvite(parsed.data);
  if (!invitation) {
    return { ok: false, error: "Couldn't send the invitation. Only owners/admins can invite." };
  }
  revalidatePath('/settings');
  return { ok: true, invitation };
}

export async function revokeInviteAction(id: string): Promise<{ ok: boolean }> {
  const ok = await revokeInvite(id);
  if (ok) revalidatePath('/settings');
  return { ok };
}

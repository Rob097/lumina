import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { invitations, memberships, type Database } from '@lumina/db';
import type { InvitableRole, InvitationSummary, InviteStatus } from '@lumina/shared';

/** Default invite lifetime in days. */
export const INVITE_TTL_DAYS = 7;

export interface CreatedInvite {
  id: string;
  token: string;
  email: string;
  role: InvitableRole;
  expiresAt: Date;
}

export interface CreateInvitationInput {
  merchantId: string;
  email: string;
  role: InvitableRole;
  invitedBy: string;
  now?: Date;
  ttlDays?: number;
}

/**
 * Create a pending invitation. Any existing pending invite for the same (merchant, email) is superseded
 * (revoked) so there's at most one live invite per address. The returned `token` goes in the email link.
 */
export async function createInvitation(
  db: Database,
  input: CreateInvitationInput,
): Promise<CreatedInvite> {
  const email = input.email.trim().toLowerCase();
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlDays ?? INVITE_TTL_DAYS) * 86_400_000);
  const token = randomBytes(24).toString('base64url');

  return db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(invitations.merchantId, input.merchantId),
          eq(invitations.email, email),
          eq(invitations.status, 'pending'),
        ),
      );
    const [row] = await tx
      .insert(invitations)
      .values({
        merchantId: input.merchantId,
        email,
        role: input.role,
        token,
        status: 'pending',
        invitedBy: input.invitedBy,
        expiresAt,
      })
      .returning({ id: invitations.id });
    if (!row) throw new Error('invitation insert failed');
    return { id: row.id, token, email, role: input.role, expiresAt };
  });
}

export async function listInvitations(
  db: Database,
  merchantId: string,
): Promise<InvitationSummary[]> {
  const rows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.merchantId, merchantId))
    .orderBy(invitations.createdAt);
  return rows
    .map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.status as InviteStatus,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }))
    .reverse(); // newest first
}

/** Revoke a pending invite (scoped to the merchant). Returns whether a row changed. */
export async function revokeInvitation(
  db: Database,
  merchantId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .update(invitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.merchantId, merchantId),
        eq(invitations.status, 'pending'),
      ),
    )
    .returning({ id: invitations.id });
  return rows.length > 0;
}

export type AcceptResult =
  | { ok: true; merchantId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' };

/**
 * Accept an invite by token: adds the user to the workspace with the invited role and marks the invite
 * accepted. Idempotent on the membership (unique merchant+user). Expired pending invites are flagged
 * `expired`; non-pending invites are rejected.
 */
export async function acceptInvitation(
  db: Database,
  input: { token: string; userId: string; now?: Date },
): Promise<AcceptResult> {
  const now = input.now ?? new Date();
  const [inv] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.token, input.token))
    .limit(1);
  if (!inv || inv.status === 'invalid') return { ok: false, reason: 'invalid' };
  if (inv.status === 'accepted') return { ok: true, merchantId: inv.merchantId }; // idempotent re-accept
  if (inv.status !== 'pending') return { ok: false, reason: 'revoked' };
  if (inv.expiresAt.getTime() < now.getTime()) {
    await db.update(invitations).set({ status: 'expired' }).where(eq(invitations.id, inv.id));
    return { ok: false, reason: 'expired' };
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ merchantId: inv.merchantId, userId: input.userId, role: inv.role })
      .onConflictDoNothing();
    await tx
      .update(invitations)
      .set({ status: 'accepted', acceptedAt: now })
      .where(eq(invitations.id, inv.id));
    return { ok: true, merchantId: inv.merchantId };
  });
}

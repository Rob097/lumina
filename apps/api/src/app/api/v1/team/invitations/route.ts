import { eq } from 'drizzle-orm';
import { merchants } from '@lumina/db';
import { CreateInviteSchema, type InvitationSummary } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';
import { emailSenderFromEnv, type EmailSender } from '@/lib/email';
import { createInvitation, listInvitations } from '@/lib/account/invitations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dashboardUrl(): string {
  return process.env.DASHBOARD_URL ?? 'http://localhost:3000';
}

async function sendInviteEmail(
  sender: EmailSender,
  p: { to: string; token: string; workspace: string; inviter: string },
): Promise<void> {
  const link = `${dashboardUrl()}/invite/${p.token}`;
  await sender.send({
    to: p.to,
    subject: `You're invited to ${p.workspace} on YuzuView`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">
      <p>${p.inviter} invited you to join <strong>${p.workspace}</strong> on YuzuView.</p>
      <p><a href="${link}">Accept the invitation</a> (the link expires in 7 days).</p></div>`,
    text: `${p.inviter} invited you to join ${p.workspace} on YuzuView.\nAccept: ${link}\n(The link expires in 7 days.)`,
  });
}

/** GET /v1/team/invitations — list this workspace's invitations (Settings → Team). */
export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const invitations = await listInvitations(guard.db, guard.merchantId);
  return jsonResponse({ invitations });
}

/** POST /v1/team/invitations — invite a teammate by email. Owner/admin/support only (not plain members). */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  if (guard.role === 'member') {
    return errorResponse('unauthorized', 'Only owners and admins can invite teammates.');
  }
  const parsed = CreateInviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Enter a valid email and role.');
  }

  const inv = await createInvitation(guard.db, {
    merchantId: guard.merchantId,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedBy: guard.user.id,
  });

  const [workspace] = await guard.db
    .select({ name: merchants.name })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  // Best-effort — the invite row exists regardless; a send failure shouldn't 500 the request.
  try {
    await sendInviteEmail(emailSenderFromEnv(process.env), {
      to: inv.email,
      token: inv.token,
      workspace: workspace?.name ?? 'your workspace',
      inviter: guard.user.email,
    });
  } catch {
    /* ignore — invite is still listed; the link can be re-sent */
  }

  const body: InvitationSummary = {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: 'pending',
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  };
  return jsonResponse(body, { status: 201 });
}

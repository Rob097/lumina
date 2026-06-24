import type { SupportCategory } from '@lumina/shared';
import type { EmailSender } from '@/lib/email';

/** Injected deps so the service is unit-testable without a live email provider. */
export interface SupportDeps {
  email: EmailSender;
  /** Where support tickets are delivered (the YuzuView team inbox). */
  supportAddress: string;
}

export interface SupportInput {
  merchantId: string;
  merchantName?: string;
  plan?: string;
  /** The submitting user's email (so the team can reply). */
  userEmail: string;
  category: SupportCategory;
  subject: string;
  message: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Relay a merchant's support request to the team inbox. The email carries the workspace context
 * (id, name, plan) and the sender's address so a reply lands back with the right merchant.
 */
export async function sendSupportRequest(deps: SupportDeps, input: SupportInput): Promise<void> {
  const subject = `[Support · ${input.category}] ${input.subject}`;
  const lines = [
    `From: ${input.userEmail}`,
    `Workspace: ${input.merchantName ?? '—'} (${input.merchantId})`,
    `Plan: ${input.plan ?? '—'}`,
    `Category: ${input.category}`,
    '',
    input.message,
  ];
  const text = lines.join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">
      <p><strong>From:</strong> ${escapeHtml(input.userEmail)}</p>
      <p><strong>Workspace:</strong> ${escapeHtml(input.merchantName ?? '—')} (${escapeHtml(input.merchantId)})</p>
      <p><strong>Plan:</strong> ${escapeHtml(input.plan ?? '—')}</p>
      <p><strong>Category:</strong> ${escapeHtml(input.category)}</p>
      <hr />
      <p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>
    </div>
  `.trim();

  await deps.email.send({ to: deps.supportAddress, subject, html, text });
}

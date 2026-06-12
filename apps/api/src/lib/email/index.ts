/**
 * Email port. Kept provider-agnostic so notifications (and later, invites/receipts) send through one
 * seam. The Resend adapter talks to the REST API directly (no SDK dependency); when `RESEND_API_KEY`
 * is absent the no-op sender lets in-app notifications work and simply skips email.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

/** Drops every message — used when email isn't configured (no RESEND_API_KEY). */
export const NOOP_EMAIL_SENDER: EmailSender = { async send() {} };

/** Resend adapter over its REST API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendSender(apiKey: string, from: string): EmailSender {
  return {
    async send(msg) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          ...(msg.text ? { text: msg.text } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Resend send failed: ${res.status}`);
      }
    },
  };
}

/** Build the sender from env: Resend when configured, else a no-op (email simply doesn't go out). */
export function emailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return NOOP_EMAIL_SENDER;
  }
  const from = env.RESEND_FROM ?? 'LUMINA <notifications@lumina.app>';
  return createResendSender(apiKey, from);
}

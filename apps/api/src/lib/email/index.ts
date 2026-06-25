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

/** Last-resort sender used when RESEND_FROM is unset or unusable. */
const DEFAULT_FROM = 'YuzuView <notifications@rdlabs.digital>';

/**
 * Coerce `RESEND_FROM` into something Resend accepts. Resend's `from` must be a bare `email@domain`
 * or a `Name <email@domain>` — a domain-only value (e.g. `rdlabs.digital`) returns a 422
 * `validation_error`. People reasonably set RESEND_FROM to just their verified domain, so we turn that
 * into a real mailbox on it (`YuzuView <notifications@domain>`) rather than failing every send.
 */
export function normalizeFromAddress(value: string | undefined): string {
  const v = value?.trim();
  if (!v) {
    return DEFAULT_FROM;
  }
  // Already "Name <email@domain>".
  if (/<\s*[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+\s*>/.test(v)) {
    return v;
  }
  // A bare "email@domain".
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) {
    return v;
  }
  // A bare domain like "rdlabs.digital" → build a valid sender on it.
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v)) {
    return `YuzuView <notifications@${v}>`;
  }
  return DEFAULT_FROM;
}

/** Build the sender from env: Resend when configured, else a no-op (email simply doesn't go out). */
export function emailSenderFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmailSender {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return NOOP_EMAIL_SENDER;
  }
  return createResendSender(apiKey, normalizeFromAddress(env.RESEND_FROM));
}

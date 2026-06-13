import { and, eq } from 'drizzle-orm';
import { clients, generations, type Database } from '@lumina/db';
import type { EmailSender } from '@/lib/email';

/** R2 max presign lifetime is 7 days — long enough for a client to open the link from the email. */
const RESULT_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface EmailResultDeps {
  /** Presign an R2 key to a downloadable URL (null when storage is unconfigured). */
  presignDownload: ((key: string, expiresIn?: number) => Promise<string>) | null;
  sender: EmailSender;
}

export type EmailResultOutcome =
  | { ok: true; email: string }
  | { ok: false; reason: 'not_found' | 'not_ready' | 'no_recipient' | 'storage_unconfigured' };

/**
 * Email a finished Studio render to a client (#8). Merchant-scoped (HARD RULE #1). Recipient is the
 * explicit address or, failing that, the linked client's email. Sends a 7-day signed link to the result.
 */
export async function emailGenerationResult(
  db: Database,
  deps: EmailResultDeps,
  input: { merchantId: string; generationId: string; email?: string },
): Promise<EmailResultOutcome> {
  const [gen] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, input.generationId), eq(generations.merchantId, input.merchantId)))
    .limit(1);
  if (!gen) {
    return { ok: false, reason: 'not_found' };
  }
  if (gen.status !== 'succeeded' || !gen.resultKey) {
    return { ok: false, reason: 'not_ready' };
  }

  let recipient = input.email?.trim() || undefined;
  if (!recipient && gen.clientId) {
    const [client] = await db
      .select({ email: clients.email })
      .from(clients)
      .where(and(eq(clients.id, gen.clientId), eq(clients.merchantId, input.merchantId)))
      .limit(1);
    recipient = client?.email ?? undefined;
  }
  if (!recipient) {
    return { ok: false, reason: 'no_recipient' };
  }
  if (!deps.presignDownload) {
    return { ok: false, reason: 'storage_unconfigured' };
  }

  const link = await deps.presignDownload(gen.resultKey, RESULT_LINK_TTL_SECONDS);
  const product = gen.productSnapshot.name;
  await deps.sender.send({
    to: recipient,
    subject: `Your ${product} visualization`,
    html: [
      `<p>Here's how <strong>${escapeHtml(product)}</strong> looks in your space.</p>`,
      `<p><a href="${link}">View your visualization</a> (link valid for 7 days).</p>`,
      `<p style="color:#888;font-size:12px">Sent via LUMINA.</p>`,
    ].join(''),
    text: `Here's how ${product} looks in your space: ${link} (link valid for 7 days).`,
  });
  return { ok: true, email: recipient };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

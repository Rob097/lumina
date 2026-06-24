import { describe, it, expect } from 'vitest';
import type { EmailMessage, EmailSender } from '../src/lib/email/index.js';
import { sendSupportRequest } from '../src/lib/support/service.js';

function captureSender(): { sender: EmailSender; sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return { sent, sender: { async send(msg) { sent.push(msg); } } };
}

describe('sendSupportRequest', () => {
  it('emails the support address with the merchant context and the request', async () => {
    const { sender, sent } = captureSender();
    await sendSupportRequest(
      { email: sender, supportAddress: 'support@yuzuview.test' },
      {
        merchantId: 'm_1',
        merchantName: 'Acme',
        plan: 'growth',
        userEmail: 'owner@acme.test',
        category: 'technical',
        subject: 'Widget not loading',
        message: 'The script 404s on our storefront.',
      },
    );
    expect(sent).toHaveLength(1);
    const msg = sent[0];
    if (!msg) throw new Error('no message sent');
    expect(msg.to).toBe('support@yuzuview.test');
    expect(msg.subject).toContain('Widget not loading');
    // The merchant + sender context must be present so we can act on / reply to the ticket.
    expect(msg.html).toContain('owner@acme.test');
    expect(msg.html).toContain('m_1');
    expect(msg.html).toContain('Acme');
    expect(msg.html).toContain('The script 404s on our storefront.');
    expect(msg.text).toContain('owner@acme.test');
  });

  it('propagates a sender failure (so the route can surface an error)', async () => {
    const failing: EmailSender = { async send() { throw new Error('resend down'); } };
    await expect(
      sendSupportRequest(
        { email: failing, supportAddress: 'support@yuzuview.test' },
        {
          merchantId: 'm_1',
          userEmail: 'owner@acme.test',
          category: 'other',
          subject: 'Hello there',
          message: 'A message long enough to pass.',
        },
      ),
    ).rejects.toThrow();
  });
});

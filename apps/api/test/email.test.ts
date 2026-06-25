import { describe, expect, it } from 'vitest';
import {
  NOOP_EMAIL_SENDER,
  emailSenderFromEnv,
  normalizeFromAddress,
} from '../src/lib/email/index.js';

describe('normalizeFromAddress', () => {
  it('passes through a full "Name <email@domain>" sender unchanged', () => {
    expect(normalizeFromAddress('YuzuView <hi@rdlabs.digital>')).toBe(
      'YuzuView <hi@rdlabs.digital>',
    );
  });

  it('passes through a bare email address unchanged', () => {
    expect(normalizeFromAddress('support@rdlabs.digital')).toBe('support@rdlabs.digital');
  });

  it('upgrades a domain-only value into a valid sender (the RESEND_FROM foot-gun)', () => {
    // Resend rejects a bare domain with a 422 validation_error — build a real mailbox on it instead.
    expect(normalizeFromAddress('rdlabs.digital')).toBe('YuzuView <notifications@rdlabs.digital>');
  });

  it('falls back to the default sender for empty/garbage input', () => {
    expect(normalizeFromAddress(undefined)).toBe('YuzuView <notifications@rdlabs.digital>');
    expect(normalizeFromAddress('   ')).toBe('YuzuView <notifications@rdlabs.digital>');
    expect(normalizeFromAddress('not an address')).toBe('YuzuView <notifications@rdlabs.digital>');
  });
});

describe('emailSenderFromEnv', () => {
  it('returns the no-op sender when RESEND_API_KEY is absent', () => {
    expect(emailSenderFromEnv({})).toBe(NOOP_EMAIL_SENDER);
  });

  it('builds a Resend sender when configured (does not throw on a domain-only RESEND_FROM)', () => {
    const sender = emailSenderFromEnv({ RESEND_API_KEY: 're_test', RESEND_FROM: 'rdlabs.digital' });
    expect(sender).not.toBe(NOOP_EMAIL_SENDER);
    expect(typeof sender.send).toBe('function');
  });
});

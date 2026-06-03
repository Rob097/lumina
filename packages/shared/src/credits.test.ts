import { describe, it, expect } from 'vitest';
import { CreditsResponseSchema, LedgerEntrySchema } from './credits.js';

describe('LedgerEntrySchema', () => {
  it('parses a ledger entry (signed amount + reason)', () => {
    const e = LedgerEntrySchema.parse({
      id: 'l1',
      amount: -1,
      reason: 'generation',
      note: null,
      createdAt: '2026-05-31T10:00:00.000Z',
    });
    expect(e.amount).toBe(-1);
  });

  it('rejects an unknown reason', () => {
    expect(() =>
      LedgerEntrySchema.parse({ id: 'l1', amount: 5, reason: 'bonus', note: null, createdAt: 'x' }),
    ).toThrow();
  });
});

describe('CreditsResponseSchema', () => {
  it('parses a credits view', () => {
    const c = CreditsResponseSchema.parse({
      balance: 2840,
      included: 10_000,
      used: 7160,
      resetsAt: '2026-06-01T00:00:00.000Z',
      ledger: [],
    });
    expect(c.balance).toBe(2840);
    expect(c.resetsAt).toBeTruthy();
  });

  it('allows a null resetsAt', () => {
    expect(
      CreditsResponseSchema.parse({ balance: 0, included: 0, used: 0, resetsAt: null, ledger: [] })
        .resetsAt,
    ).toBeNull();
  });
});

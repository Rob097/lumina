import { describe, expect, it } from 'vitest';
import { mustReplaceCustomer } from '../src/lib/billing/customer.js';

describe('mustReplaceCustomer (Stripe one-currency-per-customer guard)', () => {
  it('replaces a missing customer (retrieve returned resource_missing → null)', () => {
    expect(mustReplaceCustomer(null, 'eur')).toBe(true);
  });

  it('replaces a deleted customer', () => {
    expect(mustReplaceCustomer({ deleted: true }, 'eur')).toBe(true);
  });

  it('replaces a customer currency-locked to a different currency (legacy USD vs new EUR)', () => {
    expect(mustReplaceCustomer({ currency: 'usd' }, 'eur')).toBe(true);
  });

  it('keeps a fresh customer that has no currency yet (usable for any currency)', () => {
    expect(mustReplaceCustomer({ currency: null }, 'eur')).toBe(false);
    expect(mustReplaceCustomer({ currency: undefined }, 'eur')).toBe(false);
  });

  it('keeps a customer already on the target currency', () => {
    expect(mustReplaceCustomer({ currency: 'eur' }, 'eur')).toBe(false);
  });
});

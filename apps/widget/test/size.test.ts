import { describe, it, expect } from 'vitest';
import { assertUnderBudget, MAX_GZIP_BYTES } from '../scripts/check-bundle-size.js';

describe('assertUnderBudget', () => {
  it('passes when the bundle is under budget', () => {
    expect(() => assertUnderBudget(10_000)).not.toThrow();
    expect(() => assertUnderBudget(MAX_GZIP_BYTES)).not.toThrow();
  });

  it('throws with the size in KB when over budget', () => {
    expect(() => assertUnderBudget(MAX_GZIP_BYTES + 1)).toThrow(/KB/);
  });
});

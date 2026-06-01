import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
} from './errors.js';

describe('errors', () => {
  it('maps named codes to snake_case wire values', () => {
    expect(ERROR_CODES.INSUFFICIENT_CREDITS).toBe('insufficient_credits');
    expect(ERROR_CODES.DOMAIN_NOT_ALLOWED).toBe('domain_not_allowed');
    expect(ErrorCodeSchema.parse('rate_limited')).toBe('rate_limited');
    expect(() => ErrorCodeSchema.parse('teapot')).toThrow();
  });

  it('assigns the correct HTTP status per code', () => {
    expect(ERROR_HTTP_STATUS.insufficient_credits).toBe(402);
    expect(ERROR_HTTP_STATUS.invalid_key).toBe(401);
    expect(ERROR_HTTP_STATUS.domain_not_allowed).toBe(403);
    expect(ERROR_HTTP_STATUS.rate_limited).toBe(429);
    expect(ERROR_HTTP_STATUS.not_found).toBe(404);
  });

  it('validates the standard error envelope and requires requestId', () => {
    const ok = { error: { code: 'not_found', message: 'nope', requestId: 'req_123' } };
    expect(ErrorEnvelopeSchema.parse(ok)).toEqual(ok);
    expect(() =>
      ErrorEnvelopeSchema.parse({ error: { code: 'not_found', message: 'nope' } }),
    ).toThrow();
  });
});

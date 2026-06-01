/**
 * @lumina/api — public widget API + merchant API + Inngest endpoint (Next.js Route Handlers).
 *
 * M0 stub. Route handlers land in M1 (auth/keys/billing) and M2 (generation). This placeholder
 * imports the shared contract to prove types flow DB → API → widget via `@lumina/shared`.
 */
import { ERROR_CODES, type ErrorEnvelope } from '@lumina/shared';

export function notFound(requestId: string): ErrorEnvelope {
  return {
    error: { code: ERROR_CODES.NOT_FOUND, message: 'Not found', requestId },
  };
}

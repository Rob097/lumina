import { z } from 'zod';

/**
 * Standard error codes + the canonical error envelope (architecture §6.1).
 * Every public endpoint returns `{ error: { code, message, requestId } }` with the matching HTTP status.
 */
export const ERROR_CODES = {
  INVALID_KEY: 'invalid_key',
  UNAUTHORIZED: 'unauthorized',
  DOMAIN_NOT_ALLOWED: 'domain_not_allowed',
  RATE_LIMITED: 'rate_limited',
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  INVALID_INPUT: 'invalid_input',
  UNSUPPORTED_IMAGE: 'unsupported_image',
  GENERATION_FAILED: 'generation_failed',
  NOT_FOUND: 'not_found',
  SHOP_LIMIT: 'shop_limit',
  PLAN_REQUIRED: 'plan_required',
  INTERNAL: 'internal',
} as const;

export const ERROR_CODE_VALUES = Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ErrorCodeSchema = z.enum([
  'invalid_key',
  'unauthorized',
  'domain_not_allowed',
  'rate_limited',
  'insufficient_credits',
  'invalid_input',
  'unsupported_image',
  'generation_failed',
  'not_found',
  'shop_limit',
  'plan_required',
  'internal',
]);

/** Default HTTP status for each error code. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_key: 401,
  unauthorized: 401,
  domain_not_allowed: 403,
  rate_limited: 429,
  insufficient_credits: 402,
  invalid_input: 400,
  unsupported_image: 422,
  generation_failed: 502,
  not_found: 404,
  shop_limit: 403,
  plan_required: 403,
  internal: 500,
};

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

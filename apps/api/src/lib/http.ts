import { randomUUID } from 'node:crypto';
import { ERROR_HTTP_STATUS, type ErrorCode } from '@lumina/shared';

export function newRequestId(): string {
  return `req_${randomUUID()}`;
}

export function jsonResponse(
  data: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** Standard error envelope (§6.1) with the correct HTTP status for the code. */
export function errorResponse(
  code: ErrorCode,
  message: string,
  headers?: Record<string, string>,
): Response {
  return jsonResponse(
    { error: { code, message, requestId: newRequestId() } },
    { status: ERROR_HTTP_STATUS[code], headers },
  );
}

export function noContent(headers?: Record<string, string>): Response {
  return new Response(null, { status: 204, headers });
}

export function serverError(message: string): Response {
  return errorResponse('internal', message);
}

import {
  EventBeaconRequestSchema,
  FeedbackRequestSchema,
  GenerateResponseSchema,
  SignUploadResponseSchema,
  StatusResponseSchema,
  WidgetConfigResponseSchema,
  ErrorEnvelopeSchema,
  type EventBeaconRequest,
  type FeedbackRequest,
  type GenerateRequest,
  type GenerateResponse,
  type SignUploadResponse,
  type StatusResponse,
  type WidgetConfigResponse,
  type ErrorCode,
} from '@lumina/shared';

/** Structural view of a Zod schema — lets us validate without taking a direct `zod` dependency. */
interface Parser<T> {
  parse(data: unknown): T;
}

/**
 * Typed client for the public widget API (§6.2). The widget only ever talks to these endpoints; it
 * authenticates with the publishable `site_key` (HARD RULE #2) and validates every response against the
 * shared Zod schemas (HARD RULE #5/#6). Non-2xx responses are parsed into a typed {@link ApiError}.
 * `fetch` is injected so the client is unit-testable offline.
 */

interface ResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<ResponseLike>;

export interface ApiClientOptions {
  baseUrl: string;
  siteKey: string;
  fetch?: FetchLike;
}

/** A failed widget API call, carrying the standard envelope's `code`/`requestId` + HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly requestId: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isInsufficientCredits(): boolean {
    return this.code === 'insufficient_credits';
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly siteKey: string;
  private readonly fetchFn: FetchLike;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.siteKey = options.siteKey;
    this.fetchFn =
      options.fetch ?? ((url, init) => fetch(url, init) as unknown as Promise<ResponseLike>);
  }

  getConfig(): Promise<WidgetConfigResponse> {
    const url = `${this.baseUrl}/v1/widget/config?site_key=${encodeURIComponent(this.siteKey)}`;
    return this.request('GET', url, { schema: WidgetConfigResponseSchema });
  }

  signUpload(contentType: string): Promise<SignUploadResponse> {
    return this.request('POST', `${this.baseUrl}/v1/widget/sign-upload`, {
      body: { contentType, kind: 'room' },
      schema: SignUploadResponseSchema,
    });
  }

  /** Upload the room photo straight to R2 with the presigned URL (no key header — the URL is the auth). */
  async putRoom(uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
    const res = await this.fetchFn(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': contentType },
    });
    if (!res.ok) {
      throw new ApiError('internal', `upload failed (${res.status})`, '', res.status);
    }
  }

  generate(req: GenerateRequest, idempotencyKey?: string): Promise<GenerateResponse> {
    return this.request('POST', `${this.baseUrl}/v1/widget/generate`, {
      body: req,
      schema: GenerateResponseSchema,
      idempotencyKey,
    });
  }

  status(id: string): Promise<StatusResponse> {
    return this.request('GET', `${this.baseUrl}/v1/widget/status/${encodeURIComponent(id)}`, {
      schema: StatusResponseSchema,
    });
  }

  async feedback(req: FeedbackRequest): Promise<void> {
    await this.request('POST', `${this.baseUrl}/v1/widget/feedback`, {
      body: FeedbackRequestSchema.parse(req),
    });
  }

  async event(req: EventBeaconRequest): Promise<void> {
    await this.request('POST', `${this.baseUrl}/v1/widget/event`, {
      body: EventBeaconRequestSchema.parse(req),
    });
  }

  private async request<T>(
    method: string,
    url: string,
    opts: { body?: unknown; schema?: Parser<T>; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { 'X-Lumina-Key': this.siteKey };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const res = await this.fetchFn(url, {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (!res.ok) throw await toApiError(res);
    return opts.schema ? opts.schema.parse(await res.json()) : (undefined as T);
  }
}

async function toApiError(res: ResponseLike): Promise<ApiError> {
  try {
    const parsed = ErrorEnvelopeSchema.safeParse(await res.json());
    if (parsed.success) {
      const { code, message, requestId } = parsed.data.error;
      return new ApiError(code, message, requestId, res.status);
    }
  } catch {
    /* body wasn't JSON — fall through to a generic error */
  }
  return new ApiError('internal', `request failed (${res.status})`, '', res.status);
}

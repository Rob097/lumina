import { describe, it, expect, vi } from 'vitest';
import { ApiClient, ApiError } from '../src/core/api.js';

interface Stub {
  status?: number;
  body?: unknown;
}

function fakeFetch(route: (url: string, init?: RequestInit) => Stub) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body } = route(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  });
  return { fn, calls };
}

const configBody = {
  enabled: true,
  theme: { accent: '#111', mode: 'light', radius: 8 },
  buttonText: 'Try it',
  locale: 'en',
  i18n: {},
  watermark: false,
  limits: { anonDailyCap: 5, maxUploadBytes: 10_485_760, maxImageEdgePx: 2048 },
  resultCta: null,
  guide: null,
};

function client(fetchFn: ReturnType<typeof fakeFetch>['fn']) {
  return new ApiClient({ baseUrl: 'https://api.test', siteKey: 'pk_test_x', fetch: fetchFn });
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

describe('ApiClient', () => {
  it('getConfig sends the key header + ?site_key and parses the response', async () => {
    const { fn, calls } = fakeFetch(() => ({ body: configBody }));
    const cfg = await client(fn).getConfig();
    expect(calls[0]?.url).toContain('/v1/widget/config');
    expect(calls[0]?.url).toContain('site_key=pk_test_x');
    expect(headerOf(calls[0]?.init, 'X-Lumina-Key')).toBe('pk_test_x');
    expect(cfg.limits.maxImageEdgePx).toBe(2048);
  });

  it('signUpload posts { contentType, kind:"room" }', async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: { uploadUrl: 'https://r2.test/put', roomKey: 'rooms/m/x.jpg', expiresIn: 600 },
    }));
    const res = await client(fn).signUpload('image/jpeg');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      contentType: 'image/jpeg',
      kind: 'room',
    });
    expect(res.roomKey).toBe('rooms/m/x.jpg');
  });

  it('putRoom PUTs the blob to the presigned URL without the key header', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 200 }));
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await client(fn).putRoom('https://r2.test/put?sig=1', blob, 'image/jpeg');
    expect(calls[0]?.url).toBe('https://r2.test/put?sig=1');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(headerOf(calls[0]?.init, 'X-Lumina-Key')).toBeUndefined();
  });

  it('putRoom throws an ApiError when the upload fails', async () => {
    const { fn } = fakeFetch(() => ({ status: 403, body: 'denied' }));
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await expect(client(fn).putRoom('https://r2.test/put', blob, 'image/jpeg')).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('generate sends the Idempotency-Key header when provided', async () => {
    const { fn, calls } = fakeFetch(() => ({ status: 201, body: { generationId: 'g1', status: 'queued' } }));
    const res = await client(fn).generate(
      { productId: 'SKU', roomKey: 'rooms/m/x.jpg', anonId: 'v_1' },
      'idem-123',
    );
    expect(headerOf(calls[0]?.init, 'Idempotency-Key')).toBe('idem-123');
    expect(res).toEqual({ generationId: 'g1', status: 'queued' });
  });

  it('maps the error envelope to a typed ApiError (insufficient_credits flagged)', async () => {
    const { fn } = fakeFetch(() => ({
      status: 402,
      body: { error: { code: 'insufficient_credits', message: 'no credits', requestId: 'req_1' } },
    }));
    const err = await client(fn)
      .generate({ productId: 'SKU', roomKey: 'rooms/m/x.jpg', anonId: 'v_1' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('insufficient_credits');
    expect((err as ApiError).status).toBe(402);
    expect((err as ApiError).requestId).toBe('req_1');
    expect((err as ApiError).isInsufficientCredits).toBe(true);
  });

  it('feedback and event resolve on a 204 with no body', async () => {
    const { fn } = fakeFetch(() => ({ status: 204 }));
    await expect(
      client(fn).feedback({ generationId: 'g1', rating: 'up' }),
    ).resolves.toBeUndefined();
    await expect(client(fn).event({ type: 'cta', anonId: 'v_1' })).resolves.toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createEventSink, generationEvent } from '../src/lib/observability.js';

describe('generationEvent', () => {
  it('shapes a success outcome with cost/latency/model for ops dashboards', () => {
    const e = generationEvent({
      generationId: 'g1',
      merchantId: 'm1',
      status: 'succeeded',
      model: 'nano-banana-pro',
      costCents: 13,
      latencyMs: 9000,
      creditsSpent: 1,
    });
    expect(e).toMatchObject({
      event: 'generation.finished',
      status: 'succeeded',
      model: 'nano-banana-pro',
      costCents: 13,
      latencyMs: 9000,
      creditsSpent: 1,
      errorCode: null,
    });
  });

  it('shapes a failure with the error code and null cost', () => {
    const e = generationEvent({
      generationId: 'g1',
      merchantId: 'm1',
      status: 'failed',
      creditsSpent: 1,
      errorCode: 'not_interior',
    });
    expect(e).toMatchObject({ status: 'failed', errorCode: 'not_interior', costCents: null, model: null });
  });
});

describe('createEventSink', () => {
  it('falls back to a no-throw sink when Axiom env is absent', () => {
    const sink = createEventSink({});
    expect(() => sink.track({ event: 'x' })).not.toThrow();
  });

  it('POSTs to Axiom ingest when configured', () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sink = createEventSink({ AXIOM_TOKEN: 'tok', AXIOM_DATASET: 'lumina' });
    sink.track({ event: 'generation.finished', merchantId: 'm1' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/datasets/lumina/ingest');
    expect(init?.method).toBe('POST');
    vi.unstubAllGlobals();
  });

  it('honors AXIOM_URL for a non-default (e.g. EU) region deployment', () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sink = createEventSink({
      AXIOM_TOKEN: 'tok',
      AXIOM_DATASET: 'lumina',
      AXIOM_URL: 'https://api.eu.axiom.co',
    });
    sink.track({ event: 'generation.finished' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.eu.axiom.co/v1/datasets/lumina/ingest');
    vi.unstubAllGlobals();
  });
});

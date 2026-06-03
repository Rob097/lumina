import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StatusResponse } from '@lumina/shared';
import { subscribeStatus, type StatusApi } from '../src/core/status.js';

function apiReturning(seq: Array<Partial<StatusResponse>>): StatusApi & { calls: () => number } {
  let i = 0;
  const status = vi.fn(async (): Promise<StatusResponse> => {
    const next = seq[Math.min(i, seq.length - 1)] ?? {};
    i += 1;
    return { id: 'g1', status: 'processing', ...next };
  });
  return { status, calls: () => status.mock.calls.length };
}

describe('subscribeStatus (polling)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits updates until a terminal status, then stops polling', async () => {
    const api = apiReturning([
      { status: 'processing', stage: 'compose' },
      { status: 'succeeded', resultUrl: 'https://r/x.jpg', beforeUrl: 'https://r/y.jpg' },
    ]);
    const updates: string[] = [];
    subscribeStatus(api, 'g1', { onUpdate: (s) => updates.push(s.status) });

    await vi.advanceTimersByTimeAsync(0); // first poll
    await vi.advanceTimersByTimeAsync(600); // second poll (~500ms backoff)
    await vi.advanceTimersByTimeAsync(5000); // would poll again if not terminal

    expect(updates).toEqual(['processing', 'succeeded']);
    expect(api.calls()).toBe(2);
  });

  it('stops on a failed status', async () => {
    const api = apiReturning([
      { status: 'failed', error: { code: 'generation_failed', message: 'x' } },
    ]);
    const updates: string[] = [];
    subscribeStatus(api, 'g1', { onUpdate: (s) => updates.push(s.status) });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(updates).toEqual(['failed']);
    expect(api.calls()).toBe(1);
  });

  it('stops polling once aborted', async () => {
    const api = apiReturning([{ status: 'processing' }]);
    const controller = new AbortController();
    subscribeStatus(api, 'g1', { onUpdate: () => {}, signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0); // first poll
    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.calls()).toBe(1);
  });

  it('keeps polling through a transient error', async () => {
    let calls = 0;
    const api: StatusApi = {
      status: vi.fn(async (): Promise<StatusResponse> => {
        calls += 1;
        if (calls === 1) throw new Error('network');
        return { id: 'g1', status: 'succeeded', resultUrl: 'https://r/x.jpg', beforeUrl: 'https://r/y.jpg' };
      }),
    };
    const updates: string[] = [];
    subscribeStatus(api, 'g1', { onUpdate: (s) => updates.push(s.status) });
    await vi.advanceTimersByTimeAsync(0); // first poll throws
    await vi.advanceTimersByTimeAsync(600); // retry succeeds
    expect(updates).toEqual(['succeeded']);
  });
});

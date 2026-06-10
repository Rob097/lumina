import { describe, it, expect } from 'vitest';
import type { OpenOptions } from '@lumina/shared';
import { reduce, initialState } from '../src/ui/state.js';

const opts: OpenOptions = { productId: 'SKU-1' };

describe('flow reducer', () => {
  it('walks the full happy path idle -> upload -> confirm -> generating -> result', () => {
    let s = reduce(initialState, { type: 'OPEN', opts });
    expect(s.step).toBe('upload');

    s = reduce(s, { type: 'ROOM_SELECTED', previewUrl: 'blob:room' });
    expect(s.step).toBe('confirm');
    expect(s.roomPreviewUrl).toBe('blob:room');

    s = reduce(s, { type: 'SET_HINT', hint: 'on the wall' });
    expect(s.placementHint).toBe('on the wall');

    s = reduce(s, { type: 'GEN_START', generationId: 'g1' });
    expect(s.step).toBe('generating');
    expect(s.generationId).toBe('g1');

    s = reduce(s, { type: 'GEN_PROGRESS', stage: 'compose' });
    expect(s.stage).toBe('compose');

    s = reduce(s, { type: 'GEN_SUCCESS', resultUrl: 'r', beforeUrl: 'b' });
    expect(s.step).toBe('result');
    expect(s.resultUrl).toBe('r');
    expect(s.beforeUrl).toBe('b');
  });

  it('routes a generation error to the error step', () => {
    let s = reduce(initialState, { type: 'OPEN', opts });
    s = reduce(s, { type: 'ROOM_SELECTED', previewUrl: 'blob:room' });
    s = reduce(s, { type: 'GEN_START', generationId: 'g1' });
    s = reduce(s, { type: 'GEN_ERROR', code: 'insufficient_credits', message: 'no credits' });
    expect(s.step).toBe('error');
    expect(s.error?.code).toBe('insufficient_credits');
  });

  it('regenerate returns to confirm, retaining the room and clearing the old result', () => {
    let s = reduce(initialState, { type: 'OPEN', opts });
    s = reduce(s, { type: 'ROOM_SELECTED', previewUrl: 'blob:room' });
    s = reduce(s, { type: 'GEN_START', generationId: 'g1' });
    s = reduce(s, { type: 'GEN_SUCCESS', resultUrl: 'r', beforeUrl: 'b' });

    const r = reduce(s, { type: 'REGENERATE' });
    expect(r.step).toBe('confirm');
    expect(r.roomPreviewUrl).toBe('blob:room');
    expect(r.resultUrl).toBeUndefined();
    expect(r.generationId).toBeUndefined();
  });

  it('close resets to the initial idle state', () => {
    let s = reduce(initialState, { type: 'OPEN', opts });
    s = reduce(s, { type: 'ROOM_SELECTED', previewUrl: 'x' });
    expect(reduce(s, { type: 'CLOSE' })).toEqual(initialState);
  });

  it('ignores illegal transitions', () => {
    expect(reduce(initialState, { type: 'ROOM_SELECTED', previewUrl: 'x' })).toEqual(initialState);
    const up = reduce(initialState, { type: 'OPEN', opts });
    expect(reduce(up, { type: 'GEN_PROGRESS', stage: 'compose' })).toEqual(up);
  });

  it('GEN_SUBMIT enters the loader immediately, before a generationId exists', () => {
    let s = reduce(initialState, { type: 'OPEN', opts });
    s = reduce(s, { type: 'ROOM_SELECTED', previewUrl: 'blob:room' });
    s = reduce(s, { type: 'GEN_SUBMIT' });
    expect(s.step).toBe('generating');
    expect(s.generationId).toBeUndefined();

    // The later GEN_START records the id without leaving the loader.
    s = reduce(s, { type: 'GEN_START', generationId: 'g1' });
    expect(s.step).toBe('generating');
    expect(s.generationId).toBe('g1');
  });

  it('ignores GEN_SUBMIT outside the confirm step', () => {
    const up = reduce(initialState, { type: 'OPEN', opts });
    expect(reduce(up, { type: 'GEN_SUBMIT' })).toEqual(up);
  });
});

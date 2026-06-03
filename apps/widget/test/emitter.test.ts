import { describe, it, expect, vi } from 'vitest';
import { Emitter } from '../src/core/emitter.js';

describe('Emitter', () => {
  it('delivers the payload to a subscribed handler', () => {
    const emitter = new Emitter({ win: null });
    const seen: unknown[] = [];
    emitter.on('generate:start', (p) => seen.push(p));
    emitter.emit('generate:start', { generationId: 'gen_1' });
    expect(seen).toEqual([{ generationId: 'gen_1' }]);
  });

  it('off() and the returned unsubscribe both stop delivery', () => {
    const emitter = new Emitter({ win: null });
    const a = vi.fn();
    const b = vi.fn();
    const off = emitter.on('close', a);
    emitter.on('close', b);

    off();
    emitter.off('close', b);
    emitter.emit('close', { reason: 'user' });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('mirrors the event as a window CustomEvent named lumina:<event>', () => {
    const emitter = new Emitter({ win: window });
    let detail: unknown;
    const listener = (e: Event) => {
      detail = (e as CustomEvent).detail;
    };
    window.addEventListener('lumina:ready', listener);
    emitter.emit('ready', { version: '0.1.0' });
    window.removeEventListener('lumina:ready', listener);
    expect(detail).toEqual({ version: '0.1.0' });
  });

  it('isolates a throwing handler (reports it; other handlers still run)', () => {
    const onError = vi.fn();
    const emitter = new Emitter({ win: null, onError });
    const good = vi.fn();
    emitter.on('feedback', () => {
      throw new Error('boom');
    });
    emitter.on('feedback', good);

    expect(() => emitter.emit('feedback', { generationId: 'g', rating: 'up' })).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });
});

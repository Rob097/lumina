import { describe, it, expect, vi } from 'vitest';
import type { LuminaConfig, OpenOptions } from '@lumina/shared';
import { Emitter } from '../src/core/emitter.js';
import { createLumina, installQueue, type LuminaApi, type LuminaSession } from '../src/core/lumina.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeDeps() {
  const emitter = new Emitter({ win: null });
  const session: LuminaSession = {
    controller: { open: vi.fn(), close: vi.fn() },
    applyConfig: vi.fn(),
  };
  const boot = vi.fn(async (_config: LuminaConfig) => session);
  return { deps: { version: '0.1.0', emitter, boot }, session, boot, emitter };
}

describe('createLumina', () => {
  it('init boots once and emits ready once, even when called twice', async () => {
    const { deps, boot, emitter } = makeDeps();
    let ready = 0;
    emitter.on('ready', () => (ready += 1));

    const lumina = createLumina(deps);
    lumina.init({ siteKey: 'pk' });
    lumina.init({ siteKey: 'pk' });
    await flush();

    expect(boot).toHaveBeenCalledTimes(1);
    expect(ready).toBe(1);
  });

  it('open boots the session and opens the modal', async () => {
    const { deps, session } = makeDeps();
    const lumina = createLumina(deps);
    lumina.init({ siteKey: 'pk' });
    await lumina.open({ productId: 'x' } satisfies OpenOptions);
    expect(session.controller.open).toHaveBeenCalledWith({ productId: 'x' });
  });

  it('configure updates config and applies it to a live session', async () => {
    const { deps, session } = makeDeps();
    const lumina = createLumina(deps);
    lumina.init({ siteKey: 'pk' });
    await flush();
    lumina.configure({ buttonText: 'Ciao' });
    await flush();
    expect(session.applyConfig).toHaveBeenCalledWith({ buttonText: 'Ciao' });
  });

  it('preload warms the session at most once', async () => {
    const { deps, boot } = makeDeps();
    const lumina = createLumina(deps);
    lumina.init({ siteKey: 'pk' });
    lumina.preload();
    lumina.preload();
    await flush();
    expect(boot).toHaveBeenCalledTimes(1);
  });
});

describe('installQueue', () => {
  it('replaces window.Lumina and replays buffered commands in order', () => {
    const log: Array<[string, unknown]> = [];
    const api = {
      init: (c: unknown) => log.push(['init', c]),
      open: (o: unknown) => log.push(['open', o]),
    } as unknown as LuminaApi;

    const win: { Lumina?: unknown } = {
      Lumina: { q: [['init', { siteKey: 'pk' }], ['open', { productId: 'x' }]] },
    };
    installQueue(win, api);

    expect(win.Lumina).toBe(api);
    expect(log).toEqual([
      ['init', { siteKey: 'pk' }],
      ['open', { productId: 'x' }],
    ]);
  });
});

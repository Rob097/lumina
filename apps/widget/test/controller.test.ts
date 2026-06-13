import { describe, it, expect, vi } from 'vitest';
import type { StatusResponse } from '@lumina/shared';
import type { EffectiveConfig } from '../src/core/config.js';
import { Emitter } from '../src/core/emitter.js';
import { ApiError } from '../src/core/api.js';
import {
  LuminaController,
  type ControllerApi,
  type ControllerDeps,
} from '../src/core/controller.js';

function config(): EffectiveConfig {
  return {
    siteKey: 'pk_test',
    enabled: true,
    locale: 'en',
    buttonText: 'Try',
    theme: { zIndex: 2147483000 },
    watermark: false,
    i18n: {},
    limits: { anonDailyCap: 5, maxUploadBytes: 10_485_760, maxImageEdgePx: 2048 },
    resultCta: null,
  };
}

function makeApi(overrides: Partial<ControllerApi> = {}): ControllerApi {
  return {
    signUpload: vi.fn(async () => ({ uploadUrl: 'https://r2/put', roomKey: 'rooms/m/x.jpg', expiresIn: 600 })),
    putRoom: vi.fn(async () => {}),
    generate: vi.fn(async () => ({ generationId: 'g1', status: 'queued' as const })),
    status: vi.fn(async (): Promise<StatusResponse> => ({ id: 'g1', status: 'succeeded' })),
    feedback: vi.fn(async () => {}),
    event: vi.fn(async () => {}),
    ...overrides,
  };
}

const succeed = (id: string, onUpdate: (s: StatusResponse) => void): (() => void) => {
  onUpdate({ id, status: 'succeeded', resultUrl: 'https://r/res.jpg', beforeUrl: 'https://r/room.jpg' });
  return () => {};
};

function harness(opts: { api?: ControllerApi; extra?: Partial<ControllerDeps> } = {}) {
  const events: Array<{ name: string; detail: unknown }> = [];
  const win = {
    dispatchEvent: (e: Event) => {
      events.push({ name: e.type, detail: (e as CustomEvent).detail });
      return true;
    },
  };
  const emitter = new Emitter({ win });
  const api = opts.api ?? makeApi();
  const controller = new LuminaController({
    config: config(),
    api,
    emitter,
    anonId: 'v_1',
    processImage: vi.fn(async (f: Blob) => ({ blob: f, width: 100, height: 100, contentType: 'image/webp' })),
    watchStatus: succeed,
    createObjectUrl: () => 'blob:room',
    saveImage: vi.fn(),
    shareFn: vi.fn(async () => 'web-share'),
    ...opts.extra,
  });
  const names = () => events.map((e) => e.name);
  return { controller, api, events, names };
}

const room = () => new Blob(['x'], { type: 'image/jpeg' });

describe('LuminaController', () => {
  it('runs open -> select -> generate -> success and emits the event sequence', async () => {
    const { controller, api, names } = harness();
    controller.open({ productId: 'SKU' });
    await controller.selectRoom(room(), 'file');
    await controller.startGeneration();

    expect(controller.state.step).toBe('result');
    expect(controller.state.resultUrl).toBe('https://r/res.jpg');
    expect(api.signUpload).toHaveBeenCalledOnce();
    expect(api.putRoom).toHaveBeenCalledOnce();
    expect(api.generate).toHaveBeenCalledOnce();
    expect(names()).toEqual(
      expect.arrayContaining([
        'lumina:open',
        'lumina:upload:start',
        'lumina:upload:done',
        'lumina:generate:start',
        'lumina:generate:success',
      ]),
    );
  });

  it('maps insufficient_credits to the error step with no result', async () => {
    const api = makeApi({
      generate: vi.fn(async () => {
        throw new ApiError('insufficient_credits', 'no credits', 'req_1', 402);
      }),
    });
    const { controller, names } = harness({ api });
    controller.open({ productId: 'SKU' });
    await controller.selectRoom(room(), 'file');
    await controller.startGeneration();

    expect(controller.state.step).toBe('error');
    expect(controller.state.error?.code).toBe('insufficient_credits');
    expect(controller.state.resultUrl).toBeUndefined();
    expect(names()).toContain('lumina:generate:error');
  });

  it('routes an undecodable image to a bad-image error', async () => {
    const { controller } = harness({
      extra: {
        processImage: vi.fn(async () => {
          throw new Error('decode failed');
        }),
      },
    });
    controller.open({ productId: 'SKU' });
    await controller.selectRoom(room(), 'file');
    expect(controller.state.step).toBe('error');
    expect(controller.state.error?.code).toBe('unsupported_image');
  });

  it('regenerate re-runs generation reusing the uploaded room', async () => {
    const { controller, api } = harness();
    controller.open({ productId: 'SKU' });
    await controller.selectRoom(room(), 'file');
    await controller.startGeneration();
    await controller.regenerate();

    expect(api.signUpload).toHaveBeenCalledTimes(2);
    expect(api.generate).toHaveBeenCalledTimes(2);
    expect(controller.state.step).toBe('result');
  });

  it('feedback, save, share and cta emit events + fire beacons', async () => {
    const { controller, api, names } = harness();
    controller.open({ productId: 'SKU' });
    await controller.selectRoom(room(), 'file');
    await controller.startGeneration();

    await controller.sendFeedback('up');
    expect(api.feedback).toHaveBeenCalledWith({ generationId: 'g1', rating: 'up' });

    await controller.save();
    await controller.share();
    controller.ctaClick();

    expect(names()).toEqual(
      expect.arrayContaining([
        'lumina:feedback',
        'lumina:result:save',
        'lumina:result:share',
        'lumina:cta:click',
      ]),
    );
    // open + generate + success + feedback + cta beacons all POST /widget/event
    expect(api.event).toHaveBeenCalled();
  });

  it('cta click navigates to the merchant CTA url, resolving {productId} against the page', () => {
    const navigate = vi.fn();
    const cfg: EffectiveConfig = {
      ...config(),
      resultCta: { label: 'Add to cart', urlTemplate: '/?add-to-cart={productId}' },
    };
    const { controller } = harness({
      extra: { config: cfg, navigate, pageUrl: 'https://shop.test/product/widget' },
    });
    controller.open({ productId: '242293' });
    controller.ctaClick();
    expect(navigate).toHaveBeenCalledWith('https://shop.test/?add-to-cart=242293');
  });

  it('interpolates {productUrl} and keeps absolute CTA templates intact', () => {
    const navigate = vi.fn();
    const cfg: EffectiveConfig = {
      ...config(),
      resultCta: { label: 'View product', urlTemplate: '{productUrl}' },
    };
    const { controller } = harness({
      extra: { config: cfg, navigate, pageUrl: 'https://shop.test/p/9' },
    });
    controller.open({ productId: 'X' });
    controller.ctaClick();
    expect(navigate).toHaveBeenCalledWith('https://shop.test/p/9');
  });

  it('does not navigate when no result CTA is configured', () => {
    const navigate = vi.fn();
    const { controller } = harness({ extra: { navigate } });
    controller.open({ productId: 'SKU' });
    controller.ctaClick();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('carries a coverage estimate into state and interpolates {quantity} into the CTA (#7)', async () => {
    const navigate = vi.fn();
    const cfg: EffectiveConfig = {
      ...config(),
      resultCta: { label: 'Add to cart', urlTemplate: '/?add-to-cart={productId}&quantity={quantity}' },
    };
    const withEstimate = (id: string, onUpdate: (s: StatusResponse) => void): (() => void) => {
      onUpdate({
        id,
        status: 'succeeded',
        resultUrl: 'https://r/res.jpg',
        beforeUrl: 'https://r/room.jpg',
        suggestedQuantity: 9,
        quantityRationale: 'About 9 tiles.',
      });
      return () => {};
    };
    const { controller } = harness({
      extra: { config: cfg, navigate, pageUrl: 'https://shop.test/p', watchStatus: withEstimate },
    });
    controller.open({ productId: 'SKU' });
    await controller.selectRoom(room(), 'file');
    await controller.startGeneration();
    expect(controller.state.suggestedQuantity).toBe(9);
    expect(controller.state.quantity).toBe(9); // seeded from the estimate

    controller.setQuantity(12);
    controller.ctaClick();
    expect(navigate).toHaveBeenCalledWith('https://shop.test/?add-to-cart=SKU&quantity=12');
  });
});

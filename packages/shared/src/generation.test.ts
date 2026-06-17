import { describe, expect, it } from 'vitest';
import {
  GenerationDetailSchema,
  GenerationSummarySchema,
  GenerationsListResponseSchema,
} from './generation.js';

const SUMMARY = {
  id: '11111111-1111-1111-1111-111111111111',
  status: 'succeeded',
  productId: '22222222-2222-2222-2222-222222222222',
  productName: 'Aura Floor Lamp',
  productCategory: 'lighting',
  createdAt: '2026-06-01T10:00:00.000Z',
  finishedAt: '2026-06-01T10:00:11.000Z',
  creditsSpent: 1,
  model: 'gemini-3-pro-image-preview',
  latencyMs: 11000,
  errorCode: null,
  pageUrl: 'https://shop.it/p/aura',
  resultUrl: 'https://cdn.lumina.app/cdn-cgi/image/width=480/results/m1/g1.jpg',
  roomUrl: null,
  clientId: null,
};

describe('GenerationSummarySchema', () => {
  it('parses a succeeded generation summary', () => {
    const g = GenerationSummarySchema.parse(SUMMARY);
    expect(g.status).toBe('succeeded');
    expect(g.productName).toBe('Aura Floor Lamp');
    expect(g.resultUrl).toContain('results/m1');
  });

  it('allows a null product id (product later deleted) but keeps the snapshot name', () => {
    const g = GenerationSummarySchema.parse({
      ...SUMMARY,
      productId: null,
      status: 'failed',
      finishedAt: null,
      model: null,
      latencyMs: null,
      errorCode: 'bad_image',
      resultUrl: null,
    });
    expect(g.productId).toBeNull();
    expect(g.errorCode).toBe('bad_image');
  });

  it('rejects an unknown status', () => {
    expect(() => GenerationSummarySchema.parse({ ...SUMMARY, status: 'cancelled' })).toThrow();
  });

  it('carries an optional client link (Studio renders) and allows null', () => {
    expect(GenerationSummarySchema.parse(SUMMARY).clientId).toBeNull();
    const linked = GenerationSummarySchema.parse({
      ...SUMMARY,
      clientId: '33333333-3333-3333-3333-333333333333',
    });
    expect(linked.clientId).toBe('33333333-3333-3333-3333-333333333333');
  });
});

describe('GenerationsListResponseSchema', () => {
  it('wraps items with an opaque cursor', () => {
    const res = GenerationsListResponseSchema.parse({
      items: [SUMMARY],
      nextCursor: '2026-06-01T10:00:00.000Z',
    });
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeTruthy();
  });

  it('allows a null cursor at the end of the list', () => {
    expect(GenerationsListResponseSchema.parse({ items: [], nextCursor: null }).nextCursor).toBeNull();
  });
});

describe('GenerationDetailSchema', () => {
  it('extends the summary with operational fields', () => {
    const d = GenerationDetailSchema.parse({
      ...SUMMARY,
      anonId: 'anon_abc',
      costCents: 4,
      placementHint: 'floor',
      suggestedQuantity: 7,
      quantityRationale: 'About 7 panels to cover the wall.',
    });
    expect(d.placementHint).toBe('floor');
    expect(d.costCents).toBe(4);
    expect(d.suggestedQuantity).toBe(7);
  });

  it('accepts a null coverage quantity for non-coverage products', () => {
    const d = GenerationDetailSchema.parse({
      ...SUMMARY,
      anonId: null,
      costCents: null,
      placementHint: null,
      suggestedQuantity: null,
      quantityRationale: null,
    });
    expect(d.suggestedQuantity).toBeNull();
  });
});

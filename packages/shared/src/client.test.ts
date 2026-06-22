import { describe, expect, it } from 'vitest';
import {
  ClientInputSchema,
  ClientUpdateSchema,
  ClientWithStatsSchema,
  ClientsWithStatsListResponseSchema,
  EmailResultRequestSchema,
  MAX_PRODUCTS_PER_GENERATION,
  StudioGenerateRequestSchema,
} from './client.js';

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('ClientInput', () => {
  it('requires a name and accepts optional contact fields', () => {
    expect(ClientInputSchema.parse({ name: 'Mara Rossi' }).name).toBe('Mara Rossi');
    const full = ClientInputSchema.parse({
      name: 'Mara',
      email: 'mara@example.com',
      phone: '+39 333 1112222',
      notes: 'Prefers oak tones',
    });
    expect(full.email).toBe('mara@example.com');
  });

  it('rejects an empty name and a malformed email', () => {
    expect(() => ClientInputSchema.parse({ name: '' })).toThrow();
    expect(() => ClientInputSchema.parse({ name: 'Mara', email: 'not-an-email' })).toThrow();
  });

  it('ClientUpdate allows any subset', () => {
    expect(ClientUpdateSchema.parse({})).toEqual({});
    expect(ClientUpdateSchema.parse({ phone: '123' }).phone).toBe('123');
  });
});

describe('StudioGenerateRequest', () => {
  it('requires a uuid productId + roomKey and allows an optional clientId', () => {
    const req = StudioGenerateRequestSchema.parse({
      productId: '0b5a4f2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
      roomKey: 'rooms/m/r.jpg',
      clientId: '1b5a4f2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
    });
    expect(req.clientId).toBeDefined();
  });

  it('rejects a non-uuid productId', () => {
    expect(() =>
      StudioGenerateRequestSchema.parse({ productId: 'SKU-1', roomKey: 'rooms/m/r.jpg' }),
    ).toThrow();
  });
});

describe('StudioGenerateRequest — multi-product', () => {
  const room = 'rooms/m/r.jpg';

  it('accepts a productIds array and exposes it on the parsed output', () => {
    const parsed = StudioGenerateRequestSchema.parse({ productIds: [uuid(1), uuid(2)], roomKey: room });
    expect(parsed.productIds).toEqual([uuid(1), uuid(2)]);
  });

  it('normalizes a legacy single productId to a one-element productIds array', () => {
    const parsed = StudioGenerateRequestSchema.parse({ productId: uuid(1), roomKey: room });
    expect(parsed.productIds).toEqual([uuid(1)]);
  });

  it('rejects a request with neither productId nor productIds', () => {
    expect(StudioGenerateRequestSchema.safeParse({ roomKey: room }).success).toBe(false);
  });

  it('rejects an empty productIds array', () => {
    expect(StudioGenerateRequestSchema.safeParse({ productIds: [], roomKey: room }).success).toBe(false);
  });

  it(`rejects more than ${MAX_PRODUCTS_PER_GENERATION} products`, () => {
    const tooMany = Array.from({ length: MAX_PRODUCTS_PER_GENERATION + 1 }, (_, i) => uuid(i % 9));
    expect(StudioGenerateRequestSchema.safeParse({ productIds: tooMany, roomKey: room }).success).toBe(false);
  });

  it('keeps the optional client/hint/instructions fields through the transform', () => {
    const parsed = StudioGenerateRequestSchema.parse({
      productIds: [uuid(1)],
      roomKey: room,
      clientId: uuid(3),
      placementHint: 'by the window',
      customInstructions: 'warm lighting',
    });
    expect(parsed).toMatchObject({
      clientId: uuid(3),
      placementHint: 'by the window',
      customInstructions: 'warm lighting',
    });
  });
});

describe('ClientWithStats', () => {
  const base = {
    id: '0b5a4f2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
    merchantId: '1b5a4f2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b',
    name: 'Mara Rossi',
    email: 'mara@example.com',
    phone: null,
    notes: null,
    createdAt: '2026-06-01T10:00:00.000Z',
  };

  it('extends a client with render count + last activity (nullable)', () => {
    const c = ClientWithStatsSchema.parse({ ...base, generationCount: 3, lastGenerationAt: '2026-06-10T09:00:00.000Z' });
    expect(c.generationCount).toBe(3);
    expect(c.lastGenerationAt).toBe('2026-06-10T09:00:00.000Z');
  });

  it('allows a client with no renders (count 0, null last activity)', () => {
    const c = ClientWithStatsSchema.parse({ ...base, generationCount: 0, lastGenerationAt: null });
    expect(c.generationCount).toBe(0);
    expect(c.lastGenerationAt).toBeNull();
  });

  it('wraps a list under `clients`', () => {
    const res = ClientsWithStatsListResponseSchema.parse({
      clients: [{ ...base, generationCount: 0, lastGenerationAt: null }],
    });
    expect(res.clients).toHaveLength(1);
  });
});

describe('EmailResultRequest', () => {
  it('accepts an empty body (defaults to the client email) or an explicit address', () => {
    expect(EmailResultRequestSchema.parse({})).toEqual({});
    expect(EmailResultRequestSchema.parse({ email: 'x@y.com' }).email).toBe('x@y.com');
    expect(() => EmailResultRequestSchema.parse({ email: 'nope' })).toThrow();
  });
});

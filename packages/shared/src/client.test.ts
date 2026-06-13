import { describe, expect, it } from 'vitest';
import {
  ClientInputSchema,
  ClientUpdateSchema,
  EmailResultRequestSchema,
  StudioGenerateRequestSchema,
} from './client.js';

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

describe('EmailResultRequest', () => {
  it('accepts an empty body (defaults to the client email) or an explicit address', () => {
    expect(EmailResultRequestSchema.parse({})).toEqual({});
    expect(EmailResultRequestSchema.parse({ email: 'x@y.com' }).email).toBe('x@y.com');
    expect(() => EmailResultRequestSchema.parse({ email: 'nope' })).toThrow();
  });
});

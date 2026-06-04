import { describe, expect, it } from 'vitest';
import {
  ApiKeySummarySchema,
  CreateKeyRequestSchema,
  CreateKeyResponseSchema,
  DomainsSchema,
  MeResponseSchema,
  MerchantUpdateSchema,
  TeamMemberSchema,
} from './account.js';

describe('api key schemas', () => {
  it('summary never includes the secret/hash', () => {
    const summary = ApiKeySummarySchema.parse({
      id: 'k1',
      kind: 'publishable',
      env: 'live',
      prefix: 'pk_live_8f3a1b2c',
      lastUsedAt: null,
      revokedAt: null,
    });
    expect(summary).not.toHaveProperty('keyHash');
    expect(Object.keys(summary)).not.toContain('key');
  });

  it('create-key request only allows valid kind/env', () => {
    expect(CreateKeyRequestSchema.parse({ kind: 'secret', env: 'test' }).kind).toBe('secret');
    expect(() => CreateKeyRequestSchema.parse({ kind: 'session', env: 'test' })).toThrow();
  });

  it('create-key response reveals the raw key once', () => {
    const res = CreateKeyResponseSchema.parse({ id: 'k1', key: 'sk_live_abc' });
    expect(res.key).toBe('sk_live_abc');
  });
});

describe('domains schema', () => {
  it('accepts hostnames incl. localhost and subdomains', () => {
    const ok = DomainsSchema.parse({ domains: ['localhost', 'shop.example.com', 'a-b.co.uk'] });
    expect(ok.domains).toHaveLength(3);
  });

  it('rejects URLs / schemes / paths', () => {
    expect(() => DomainsSchema.parse({ domains: ['https://shop.example.com'] })).toThrow();
    expect(() => DomainsSchema.parse({ domains: ['shop.example.com/path'] })).toThrow();
    expect(() => DomainsSchema.parse({ domains: [''] })).toThrow();
  });
});

describe('me schema', () => {
  it('returns the user + their merchant memberships', () => {
    const me = MeResponseSchema.parse({
      user: { id: 'u1', email: 'a@b.com' },
      merchants: [
        { id: 'm1', name: 'Acme', slug: 'acme', role: 'owner', plan: 'growth', creditsBalance: 100 },
      ],
    });
    expect(me.merchants[0]?.role).toBe('owner');
  });
});

describe('team + merchant-update schemas', () => {
  it('parses a team member with a nullable email', () => {
    const m = TeamMemberSchema.parse({
      userId: 'u1',
      email: 'sofia@store.it',
      role: 'admin',
      joinedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(m.role).toBe('admin');
    expect(TeamMemberSchema.parse({ ...m, email: null }).email).toBeNull();
  });

  it('rejects an empty merchant name', () => {
    expect(MerchantUpdateSchema.parse({ name: 'Atelier' }).name).toBe('Atelier');
    expect(() => MerchantUpdateSchema.parse({ name: '' })).toThrow();
  });
});

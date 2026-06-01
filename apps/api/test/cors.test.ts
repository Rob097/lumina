import { describe, expect, it } from 'vitest';
import { corsHeaders, isAllowedOrigin } from '../src/lib/cors.js';

describe('isAllowedOrigin', () => {
  it('matches exact hostnames', () => {
    expect(isAllowedOrigin('https://shop.example.com', ['shop.example.com'])).toBe(true);
    expect(isAllowedOrigin('https://evil.com', ['shop.example.com'])).toBe(false);
  });

  it('supports *. wildcard (base + subdomains) and localhost', () => {
    expect(isAllowedOrigin('https://a.example.com', ['*.example.com'])).toBe(true);
    expect(isAllowedOrigin('https://example.com', ['*.example.com'])).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', ['localhost'])).toBe(true);
  });

  it('rejects null / malformed origins', () => {
    expect(isAllowedOrigin(null, ['shop.example.com'])).toBe(false);
    expect(isAllowedOrigin('not a url', ['x'])).toBe(false);
  });
});

describe('corsHeaders', () => {
  it('reflects the (validated) origin and varies on it', () => {
    const h = corsHeaders('https://shop.example.com');
    expect(h['Access-Control-Allow-Origin']).toBe('https://shop.example.com');
    expect(h['Vary']).toBe('Origin');
  });
});

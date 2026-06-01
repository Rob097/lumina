import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, parseKey, safeEqual } from '../src/lib/keys.js';

describe('generateApiKey', () => {
  it('produces a pk_live_ key whose hash + prefix are consistent', () => {
    const k = generateApiKey('publishable', 'live');
    expect(k.raw).toMatch(/^pk_live_[A-Za-z0-9_-]+$/);
    expect(k.prefix).toBe(`pk_live_${k.raw.slice('pk_live_'.length, 'pk_live_'.length + 8)}`);
    expect(k.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(k.raw)).toBe(k.keyHash);
  });

  it('produces a sk_test_ key for secret/test', () => {
    const k = generateApiKey('secret', 'test');
    expect(k.raw).toMatch(/^sk_test_/);
  });

  it('is unique per call', () => {
    expect(generateApiKey('publishable', 'live').raw).not.toBe(
      generateApiKey('publishable', 'live').raw,
    );
  });
});

describe('parseKey', () => {
  it('maps pk/sk tags to kinds and extracts env', () => {
    expect(parseKey('pk_live_abc123')).toEqual({ tag: 'pk', kind: 'publishable', env: 'live' });
    expect(parseKey('sk_test_abc123')).toEqual({ tag: 'sk', kind: 'secret', env: 'test' });
  });

  it('rejects malformed keys', () => {
    expect(parseKey('nope')).toBeNull();
    expect(parseKey('pk_prod_abc')).toBeNull();
    expect(parseKey('xx_live_abc')).toBeNull();
    expect(parseKey('pk_live_')).toBeNull();
  });
});

describe('safeEqual', () => {
  it('is true for equal strings, false otherwise', () => {
    expect(safeEqual('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(safeEqual('a'.repeat(64), 'b'.repeat(64))).toBe(false);
    expect(safeEqual('short', 'longer-string')).toBe(false);
  });
});

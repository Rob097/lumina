import { describe, it, expect } from 'vitest';
import { getAnonId, type SimpleStorage } from '../src/core/anon.js';

function memoryStorage(): SimpleStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

const throwingStorage: SimpleStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

describe('getAnonId', () => {
  it('creates a v_-prefixed id and persists it', () => {
    const store = memoryStorage();
    const id = getAnonId(store);
    expect(id).toMatch(/^v_/);
    expect(store.getItem('lumina_anon_id')).toBe(id);
  });

  it('returns the same id across calls with the same storage', () => {
    const store = memoryStorage();
    expect(getAnonId(store)).toBe(getAnonId(store));
  });

  it('returns an ephemeral id (never throws) when storage is blocked', () => {
    const id = getAnonId(throwingStorage);
    expect(id).toMatch(/^v_/);
  });
});

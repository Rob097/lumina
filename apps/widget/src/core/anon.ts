/**
 * Anonymous visitor id (§3.9 / D25). A client-generated, persisted id sent as `anonId` so the server
 * can enforce per-visitor daily generation caps. Storage is injected for tests; if it's blocked
 * (private mode) we return an ephemeral id rather than throwing.
 */

const ANON_KEY = 'lumina_anon_id';

/** The slice of the Web Storage API we use — injectable so tests can supply a fake. */
export interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `v_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through to the Math.random path */
  }
  return `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function defaultStorage(): SimpleStorage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** Get the stored visitor id, creating + persisting one on first call. Never throws. */
export function getAnonId(storage?: SimpleStorage): string {
  const store = storage ?? defaultStorage();
  if (store) {
    try {
      const existing = store.getItem(ANON_KEY);
      if (existing) return existing;
      const id = randomId();
      store.setItem(ANON_KEY, id);
      return id;
    } catch {
      /* storage blocked — fall back to an ephemeral id */
    }
  }
  return randomId();
}

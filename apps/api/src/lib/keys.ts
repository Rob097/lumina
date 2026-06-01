import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { KeyEnv, KeyKind } from '@lumina/shared';

/**
 * API key crypto primitives (server-only). Keys look like `pk_live_<base64url-secret>`. We store only
 * the sha256 hash + a lookup prefix; the raw key is revealed exactly once on creation (§1.2 / §6.3).
 */

const TAG_BY_KIND: Record<KeyKind, 'pk' | 'sk'> = {
  publishable: 'pk',
  secret: 'sk',
};
const KIND_BY_TAG: Record<'pk' | 'sk', KeyKind> = {
  pk: 'publishable',
  sk: 'secret',
};
const PREFIX_SECRET_LEN = 8;
const KEY_RE = /^(pk|sk)_(test|live)_([A-Za-z0-9_-]+)$/;

export interface GeneratedApiKey {
  raw: string;
  prefix: string;
  keyHash: string;
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey(kind: KeyKind, env: KeyEnv): GeneratedApiKey {
  const tag = TAG_BY_KIND[kind];
  const secret = randomBytes(24).toString('base64url');
  const raw = `${tag}_${env}_${secret}`;
  const prefix = `${tag}_${env}_${secret.slice(0, PREFIX_SECRET_LEN)}`;
  return { raw, prefix, keyHash: hashApiKey(raw) };
}

export interface ParsedKey {
  tag: 'pk' | 'sk';
  kind: KeyKind;
  env: KeyEnv;
}

/** Parse + validate a raw key's shape. Returns null for anything malformed. */
export function parseKey(raw: string): ParsedKey | null {
  const match = KEY_RE.exec(raw);
  if (!match) {
    return null;
  }
  const tag = match[1] as 'pk' | 'sk';
  const env = match[2] as KeyEnv;
  return { tag, kind: KIND_BY_TAG[tag], env };
}

/** Compute the lookup prefix for a raw key (for O(1) DB lookup before the hash compare). */
export function prefixForKey(raw: string): string | null {
  const match = KEY_RE.exec(raw);
  if (!match) {
    return null;
  }
  const [, tag, env, secret] = match;
  return `${tag}_${env}_${secret!.slice(0, PREFIX_SECRET_LEN)}`;
}

/** Timing-safe string comparison (returns false on length mismatch instead of throwing). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

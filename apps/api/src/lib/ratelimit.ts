import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimiter {
  /** Per-site-key request limit. */
  checkKey(merchantId: string): Promise<boolean>;
  /** Per-anonymous-visitor daily generation cap (credit-drain protection, §3.9). */
  checkAnon(anonId: string): Promise<boolean>;
}

const ALLOW_ALL: RateLimiter = {
  checkKey: async () => true,
  checkAnon: async () => true,
};

/** Build an Upstash-backed limiter, or a permissive no-op when Redis isn't configured (local/tests). */
export function createRateLimiter(env: Record<string, string | undefined>): RateLimiter {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return ALLOW_ALL;
  }
  const redis = new Redis({ url, token });
  const perKey = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(Number(env.RATE_PER_MINUTE ?? 60), '1 m'),
    prefix: 'rl:key',
  });
  const anonDaily = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(Number(env.ANON_DAILY_CAP ?? 5), '1 d'),
    prefix: 'rl:anon',
  });
  return {
    checkKey: async (merchantId) => (await perKey.limit(merchantId)).success,
    checkAnon: async (anonId) => (await anonDaily.limit(anonId)).success,
  };
}

type SharpFactory = (typeof import('sharp'))['default'];

let cached: SharpFactory | undefined;
let warned = false;

/**
 * Lazily load the native `sharp` module.
 *
 * Importing sharp at module scope is a trap on a serverless host: if its native binary can't be loaded
 * (e.g. a file-tracing miss on Vercel under pnpm), the *whole* route module fails to evaluate and the
 * endpoint returns an opaque 500 before any handler runs — which is exactly what left a generation stuck
 * in QUEUED (the Inngest worker route 500'd at load, so `processGeneration` never executed). Deferring the
 * require to first use keeps the route loadable; every caller already wraps sharp usage in try/catch and
 * degrades gracefully (skip the aspect-ratio pin / the pixel-perfect composite) instead of failing.
 */
export async function loadSharp(): Promise<SharpFactory> {
  if (cached) {
    return cached;
  }
  try {
    cached = (await import('sharp')).default;
    return cached;
  } catch (err) {
    if (!warned) {
      warned = true;
      // Surface once in the runtime logs so a tracing/binary problem is visible without spamming.
      console.error('[images] sharp native module failed to load — image post-processing disabled', err);
    }
    throw err;
  }
}

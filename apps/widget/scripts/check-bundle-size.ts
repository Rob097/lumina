import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Bundle-budget gate (D26 / HARD RULE #7). The pure helpers are unit-tested; `main()` runs only when
 * the file is executed directly (`pnpm -F @lumina/widget size`). build.mjs enforces the same budget
 * inline so a production build also fails fast.
 */
export const MAX_GZIP_BYTES = 45 * 1024;

export function assertUnderBudget(bytes: number, max = MAX_GZIP_BYTES): void {
  if (bytes > max) {
    throw new Error(
      `Widget app bundle is ${(bytes / 1024).toFixed(1)} KB gzipped — over the ${(
        max / 1024
      ).toFixed(0)} KB budget (HARD RULE #7).`,
    );
  }
}

/** Locate the content-hashed app bundle (`widget.[hash].js`) in a dist directory. */
export function findAppBundle(distDir: string): string {
  const file = readdirSync(distDir).find((f) => /^widget\.[^.]+\.js$/.test(f));
  if (!file) {
    throw new Error(`No widget.[hash].js found in ${distDir} — run the build first.`);
  }
  return join(distDir, file);
}

export function gzippedSize(path: string): number {
  return gzipSync(readFileSync(path)).length;
}

function main(): void {
  const bundle = findAppBundle(join(process.cwd(), 'dist'));
  const size = gzippedSize(bundle);
  assertUnderBudget(size);
  console.log(`✓ ${bundle} — ${(size / 1024).toFixed(1)} KB gzipped (< ${MAX_GZIP_BYTES / 1024} KB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

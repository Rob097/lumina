// Two-stage widget build (D22): a content-hashed app bundle + an immutable loader that points at it.
//   stage 1 — `vite.config.ts`         -> dist/widget.[hash].js   (the Preact app, self-executing)
//   stage 2 — `vite.loader.config.ts`  -> dist/widget.js          (the line merchants paste)
//   stage 3 — enforce the < 45 KB gzip budget (HARD RULE #7 / D26)
import { build } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const MAX_GZIP_BYTES = 45 * 1024; // keep in sync with scripts/check-bundle-size.ts

// Stage 1 — content-hashed app bundle.
await build({ configFile: './vite.config.ts', mode: 'production' });

const appFile = readdirSync('dist').find((f) => /^widget\.[^.]+\.js$/.test(f));
if (!appFile) throw new Error('build: app bundle (widget.[hash].js) was not emitted');

// The URL the loader injects: `${PUBLIC_CDN_URL}/widget.[hash].js`, or root-relative for local/dev.
const cdn = (process.env.PUBLIC_CDN_URL ?? '').replace(/\/$/, '');
process.env.LUMINA_APP_BUNDLE_URL = `${cdn}/${appFile}`;

// Stage 2 — immutable loader with the hashed URL injected.
await build({ configFile: './vite.loader.config.ts', mode: 'production' });

// Stage 3 — bundle-size gate.
const gz = gzipSync(readFileSync(join('dist', appFile))).length;
if (gz > MAX_GZIP_BYTES) {
  throw new Error(
    `build: ${appFile} is ${(gz / 1024).toFixed(1)} KB gzipped — over the ${
      MAX_GZIP_BYTES / 1024
    } KB budget (HARD RULE #7).`,
  );
}
console.log(
  `✓ widget built — ${appFile} ${(gz / 1024).toFixed(1)} KB gzipped (< ${MAX_GZIP_BYTES / 1024} KB)`,
);

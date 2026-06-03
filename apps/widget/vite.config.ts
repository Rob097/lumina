import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

/**
 * App-bundle build (stage 1 of the two-stage build — see build.mjs / D22) **and** the Vitest config.
 * Emits a content-hashed, self-executing `dist/widget.[hash].js`; the loader (stage 2) injects it.
 * `__APP_BUNDLE_URL__` is the URL the loader points at — overridden per-build by build.mjs.
 */
export default defineConfig({
  plugins: [preact()],
  define: {
    __APP_BUNDLE_URL__: JSON.stringify(process.env.LUMINA_APP_BUNDLE_URL ?? '/widget.app.js'),
    __API_URL__: JSON.stringify(process.env.PUBLIC_API_URL ?? 'http://localhost:3001'),
    __SENTRY_DSN__: JSON.stringify(process.env.PUBLIC_SENTRY_DSN ?? ''),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    minify: 'terser',
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/app.ts', import.meta.url)),
      output: {
        format: 'iife',
        entryFileNames: 'widget.[hash].js',
        inlineDynamicImports: true,
        assetFileNames: 'widget.[hash][extname]',
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});

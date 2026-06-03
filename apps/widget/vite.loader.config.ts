import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Loader build (stage 2 — see build.mjs / D22). Emits the immutable, year-cacheable `dist/widget.js`
 * (the single line a merchant pastes). `__APP_BUNDLE_URL__` is injected from build.mjs via
 * `LUMINA_APP_BUNDLE_URL` so the loader points at the freshly content-hashed app bundle. No Preact
 * plugin here — the loader is plain DOM and must stay tiny (~2 KB). `emptyOutDir: false` keeps the app
 * bundle that stage 1 just wrote.
 */
export default defineConfig({
  define: {
    __APP_BUNDLE_URL__: JSON.stringify(process.env.LUMINA_APP_BUNDLE_URL ?? '/widget.app.js'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    minify: 'terser',
    rollupOptions: {
      input: fileURLToPath(new URL('./src/loader.ts', import.meta.url)),
      output: {
        format: 'iife',
        entryFileNames: 'widget.js',
        inlineDynamicImports: true,
      },
    },
  },
});

import { resolve } from 'node:path';
import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';

/**
 * Builds the dashboard live-preview library (`@lumina/widget/preview`): the real widget step
 * components, precompiled with preact bundled in, so the React dashboard can mount the actual widget
 * UI. A tiny plugin resolves the widget's `styles.css?inline` import to text (tsup/esbuild don't grok
 * Vite's `?inline` query).
 */
// Strip Vite's `?inline` query so the underlying `.css` resolves to a real file, which the global
// `.css → text` loader then turns into a JS string (no separate stylesheet, no auto-injection).
const stripCssInline: Plugin = {
  name: 'strip-css-inline',
  setup(build) {
    build.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.replace(/\?inline$/, '')),
    }));
  },
};

export default defineConfig({
  entry: { index: 'src/preview.tsx' },
  outDir: 'dist-preview',
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: false,
  external: ['@lumina/shared'],
  noExternal: [/^preact($|\/)/],
  loader: { '.css': 'text' },
  esbuildPlugins: [stripCssInline],
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.jsxImportSource = 'preact';
  },
});

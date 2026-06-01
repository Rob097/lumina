import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schema.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // postgres.js is a runtime dependency of consumers, not bundled into the package.
  external: ['postgres', 'drizzle-orm'],
});

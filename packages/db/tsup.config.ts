import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/schema.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['postgres', 'drizzle-orm'],
  },
  {
    // Test harness (`@lumina/db/testing`). ESM-only: it relies on `import.meta.url` (via the migrator)
    // to locate the migrations folder, which is unavailable in CJS. Test runners resolve ESM.
    entry: ['src/testing.ts'],
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    external: ['postgres', 'drizzle-orm', 'testcontainers', '@testcontainers/postgresql'],
  },
]);

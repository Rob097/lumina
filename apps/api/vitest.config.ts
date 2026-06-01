import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Integration specs use the shared Testcontainers harness (@lumina/db/testing).
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});

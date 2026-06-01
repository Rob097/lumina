import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Testcontainers needs time to pull/start Postgres on a cold cache.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // DB integration tests share one container; run files serially to keep it simple.
    fileParallelism: false,
  },
});

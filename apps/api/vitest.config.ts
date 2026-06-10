import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirror the Next.js `@/*` → `src/*` path alias so tests can import lib files that use it.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Integration specs use the shared Testcontainers harness (@lumina/db/testing).
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    // Silence the AWS SDK "Node 22" maintenance notice (we pin Node 20 per the stack).
    env: { AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: '1' },
  },
});

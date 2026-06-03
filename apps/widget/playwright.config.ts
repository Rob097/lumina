import { defineConfig, devices } from '@playwright/test';

/**
 * Widget E2E (acceptance). The webServer builds the widget pointing at the mock origin, then serves the
 * built bundle + `test-store.html` + the mock widget API from one origin. Chromium runs with a fake
 * media device so the camera flow works headless.
 */
const PORT = 5188;
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],
  webServer: {
    command: 'node build.mjs && node e2e/mock-api.mjs',
    env: {
      PUBLIC_API_URL: ORIGIN,
      PUBLIC_CDN_URL: ORIGIN,
      PORT: String(PORT),
    },
    url: ORIGIN,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});

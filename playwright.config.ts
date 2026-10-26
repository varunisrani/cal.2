import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLATEWISE_E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  // Specs only: the Vitest files next to the fake AI server (e2e/fake-ai/*.test.ts) are not specs.
  testMatch: '**/*.spec.ts',
  // The scripted fake AI provider on 127.0.0.1 (PLATEWISE_FAKE_AI_PORT, default 4320).
  globalSetup: './e2e/fake-ai/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // The html report lands in playwright-report/, which CI uploads when a run fails.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

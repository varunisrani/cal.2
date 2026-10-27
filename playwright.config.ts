import { defineConfig, devices, type Project } from '@playwright/test';

const port = Number(process.env.PLATEWISE_E2E_PORT ?? 4173);

/**
 * The other two engines (P10-11), for a smoke subset only and off unless asked for:
 * `PLATEWISE_E2E_ENGINES=webkit,firefox` (or `all`). Only Chromium is installed in the build
 * container; elsewhere run `pnpm exec playwright install webkit firefox` first. Without the
 * variable `pnpm e2e` runs mobile Chromium alone, as before.
 */
const engines = new Set(
  (process.env.PLATEWISE_E2E_ENGINES ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
);
const wants = (engine: 'webkit' | 'firefox'): boolean => engines.has('all') || engines.has(engine);

/** A test title as a pattern that matches it literally. */
const titled = (title: string): RegExp => new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

/**
 * The smoke subset, by test title: the shell loads (e2e/smoke.spec.ts); Settings and every
 * Settings page, and a food entered by hand and a weight logged with the keyboard
 * (e2e/a11y.spec.ts, which takes its device from the project).
 */
const SMOKE = [
  titled('loads the product name on a phone viewport'),
  titled('the Settings list and every Settings page'),
  titled('logs a food entered by hand and a weight, with a focus ring at every stop'),
];

/**
 * Smoke tests in specs that set the Pixel 7 profile themselves (the mobile flag included), which
 * Playwright's Firefox cannot emulate: WebKit only. The walking skeleton (a manual log, Demo 1)
 * and Log weight on Progress (e2e/home-progress.spec.ts).
 */
const SMOKE_MOBILE_ONLY = [
  titled('a manual entry lands under its meal, moves the gauge, survives a reload'),
  titled("logs a weight for last Tuesday in kg and shows it on the 1M chart, keeping today's"),
];

const otherEngines: Project[] = [
  ...(wants('webkit')
    ? [
        {
          name: 'mobile-webkit',
          use: { ...devices['iPhone 13'] },
          grep: [...SMOKE, ...SMOKE_MOBILE_ONLY],
        },
      ]
    : []),
  ...(wants('firefox')
    ? [
        {
          name: 'phone-firefox',
          // A phone-sized window: Playwright's Firefox has no mobile emulation.
          use: { browserName: 'firefox' as const, viewport: devices['Pixel 7'].viewport },
          grep: SMOKE,
        },
      ]
    : []),
];

export default defineConfig({
  testDir: './e2e',
  // Only specs: the Vitest files in e2e/fake-ai/ (*.test.ts) belong to `pnpm test`.
  testMatch: '**/*.spec.ts',
  // Starts the fake AI provider (e2e/fake-ai/server.ts) and returns its teardown.
  globalSetup: './e2e/fake-ai/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // The html report lands in playwright-report/, which CI keeps when a run fails.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    // The offline test of the settings and data spec (P09-19) needs the app's service worker,
    // which the project above blocks for every other spec.
    {
      name: 'offline-chromium',
      testMatch: /settings-data\.spec\.ts$/,
      grep: /@offline/,
      use: { ...devices['Pixel 7'], serviceWorkers: 'allow' },
    },
    ...otherEngines,
  ],
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

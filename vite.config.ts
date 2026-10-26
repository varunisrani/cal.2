/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // dist/.vite/manifest.json, read by scripts/bundle-budget.ts.
    manifest: true,
  },
  test: {
    environment: 'jsdom',
    // A zone with DST, so day and hour maths meet both offsets; other zones via inTimeZone().
    env: { TZ: 'America/New_York' },
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'tooling/**/*.test.ts',
      'scripts/**/*.test.ts',
      // Node-side tests of the fake AI server; each file sets its environment in a comment.
      'e2e/fake-ai/**/*.test.ts',
    ],
    restoreMocks: true,
  },
});

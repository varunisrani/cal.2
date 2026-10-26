import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { getTimeZone, setTimeZone } from './time';

// The zone every test starts in: test.env.TZ in vite.config.ts.
const pinnedTimeZone = getTimeZone();

afterEach(() => {
  // Vitest runs without globals, so Testing Library cannot register its own cleanup.
  cleanup();
  vi.useRealTimers();
  setTimeZone(pinnedTimeZone);
});

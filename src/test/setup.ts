import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { getTimeZone, setTimeZone } from './time';

// The zone every test starts in: test.env.TZ in vite.config.ts.
const pinnedTimeZone = getTimeZone();

afterEach(() => {
  vi.useRealTimers();
  setTimeZone(pinnedTimeZone);
});

import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { registerPartition } from '../i18n/onDemand';
import { registerEvery } from './partitions';
import { getTimeZone, setTimeZone } from './time';

// Every test sees the whole catalogue: the app fetches these partitions with their screens and
// services (P18-00), which a test drawing a screen on its own does not do.
registerEvery(registerPartition);

// The zone every test starts in: test.env.TZ in vite.config.ts.
const pinnedTimeZone = getTimeZone();

afterEach(() => {
  // Vitest runs without globals, so Testing Library cannot register its own cleanup.
  cleanup();
  vi.useRealTimers();
  setTimeZone(pinnedTimeZone);
});

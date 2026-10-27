// Test helper: Settings › Tracking & reminders over a fresh test database, with the real water,
// fasting, tracking settings and custom reminders services, the browser's notifications stood in
// for (src/test/notifications.ts; Android's with `system: 'android'`), and the screen harness's
// repositories, router, toasts and providers. The clock is the harness's (Monday 26 October 2026,
// 12:30 in New York) unless given.

import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { withIdSequence } from '../../../../lib/ids';
import { ServicesProvider } from '../../../../services/context';
import { createFastingService } from '../../../../services/fasting';
import { createCustomRemindersService } from '../../../../services/reminders/customReminders';
import type {
  NotificationState,
  NotificationSystem,
} from '../../../../services/reminders/notifier';
import {
  createTrackingSettingsService,
  type TrackingSettingsService,
} from '../../../../services/trackingSettings';
import { createWaterService } from '../../../../services/water';
import { fakeNotifications } from '../../../../test/notifications';
import { openHarness, type HarnessOptions } from '../../../../test/screenHarness';

export interface TrackingSetup {
  /** The browser's notification permission; 'default' (not asked yet) unless said otherwise. */
  readonly permission?: NotificationState;
  /** Whose notifications: the browser's unless said otherwise. */
  readonly system?: NotificationSystem;
  readonly clock?: HarnessOptions['clock'];
  /** The address the harness opens on. */
  readonly hash?: string;
  /** Wraps the real tracking settings service (a failing or held write). */
  readonly wrap?: (real: TrackingSettingsService) => TrackingSettingsService;
}

export async function openTracking({
  permission = 'default',
  system = 'browser',
  clock,
  hash = '#/settings/tracking',
  wrap,
}: TrackingSetup = {}) {
  const h = await openHarness({ hash, clock });
  const notifications = fakeNotifications(permission, system);
  // The engine is the notifier's business; here it only has to hear that it should check again.
  const reminders = { refresh: vi.fn(async () => undefined) };
  const real = createTrackingSettingsService({
    settingsRepo: h.repos.settingsRepo,
    notifications,
    reminders,
  });
  const trackingSettings = wrap ? wrap(real) : real;
  const services = {
    ...h.services,
    trackingSettings,
    water: createWaterService({ ...h.repos, clock: h.clock }),
    fasting: createFastingService({ ...h.repos, clock: h.clock }),
    customReminders: createCustomRemindersService({
      settingsRepo: h.repos.settingsRepo,
      clock: h.clock,
      newId: withIdSequence('reminder'),
    }),
  };

  /** Renders `ui` in the harness's providers with these services. */
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);

  return { ...h, notifications, reminders, trackingSettings, services, mount };
}

export type TrackingHarness = Awaited<ReturnType<typeof openTracking>>;

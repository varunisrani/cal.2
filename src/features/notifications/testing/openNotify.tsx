// Test helper: Home's notification parts (P17) over a fresh test database: the screen harness's
// repositories, router and providers, the real notify service over its settings (the notices and
// the opening stood in for), and the tracking settings over stand-in notifications of the Android
// app. The clock is the harness's (Monday 26 October 2026, 12:30 in New York).

import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { live } from '../../../data/live';
import type { InboxItem } from '../../../services/notifications/contract';
import { addItems } from '../../../services/notifications/inbox';
import { createNotifyService } from '../../../services/notifications/service';
import { createNotifyStore } from '../../../services/notifications/store';
import { FakeNotices } from '../../../services/notifications/testing/fakeNotices';
import { ServicesProvider } from '../../../services/context';
import type { NotificationState } from '../../../services/reminders/notifier';
import { createTrackingSettingsService } from '../../../services/trackingSettings';
import { fakeNotifications } from '../../../test/notifications';
import { FACTORY_NOW } from '../../../test/factories';
import { openHarness } from '../../../test/screenHarness';

export interface NotifySetup {
  readonly permission?: NotificationState;
  /** Without the Android app's notifications: the web. */
  readonly web?: boolean;
}

/** An inbox item at `at` (a sugar notice unless changed). */
export function inboxItem(at: number, changes: Partial<InboxItem> = {}): InboxItem {
  return {
    ref: `${changes.id ?? 300}@${at}`,
    id: 300,
    kind: 'sugarOver',
    title: 'Sugar limit passed',
    body: '62 g of 50 g today.',
    at,
    open: 'home',
    read: false,
    ...changes,
  };
}

export async function openNotify({ permission = 'granted', web = false }: NotifySetup = {}) {
  const h = await openHarness();
  const notifications = fakeNotifications(permission, 'android');
  const trackingSettings = createTrackingSettingsService({
    settingsRepo: h.repos.settingsRepo,
    notifications,
  });
  const store = createNotifyStore(h.repos.settingsRepo);
  const open = vi.fn();
  const notify = createNotifyService({
    notices: new FakeNotices(),
    store,
    settingsRepo: h.repos.settingsRepo,
    open,
    live,
  });
  const services = { ...h.services, trackingSettings, ...(web ? {} : { notify }) };
  const mount = (ui: ReactNode) =>
    h.mount(<ServicesProvider services={services}>{ui}</ServicesProvider>);
  /** Puts items in the inbox, as notices and the plan would. */
  const keep = (...items: InboxItem[]) =>
    store.inbox.change((state) => addItems(state, items, FACTORY_NOW));
  return { ...h, notifications, trackingSettings, notify, store, open, keep, mount };
}

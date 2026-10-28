// What screens use of the Android app's notifications (P17-02, P17-04), over a real settings
// repository on a test database and live reads.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { live } from '../../data/live';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import { openTestDb } from '../../test/db';
import type { InboxItem } from './contract';
import { addItems, EMPTY_INBOX } from './inbox';
import { createNotifyService } from './service';
import { createNotifyStore } from './store';
import { FakeNotices } from './testing/fakeNotices';

// Tests run in Node, but the app's tsconfig has no Node types: the fake IndexedDB runs on this.
declare const setImmediate: (run: () => void) => unknown;

const NOW = new Date('2026-10-26T12:30:00').getTime();

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function until(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 500 && !ready(); turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!ready()) throw new Error('until: the condition never held');
}

const item = (at: number, read = false): InboxItem => ({
  ref: `300@${at}`,
  id: 300,
  kind: 'sugarOver',
  title: 'Sugar limit passed',
  body: '60 g of 50 g today.',
  at,
  open: 'home',
  read,
});

async function rig() {
  const { db } = await openTestDb();
  opened.push(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  const store = createNotifyStore(settingsRepo);
  const open = vi.fn();
  const update = vi.spyOn(settingsRepo, 'update');
  const service = createNotifyService({
    notices: new FakeNotices(),
    store,
    settingsRepo,
    open,
    live,
  });
  const stop = service.subscribe(() => undefined);
  return { settingsRepo, store, service, open, update, stop };
}

describe('the notify service (P17)', () => {
  it('shows the inbox newest first with its unread count, and the card’s state', async () => {
    const r = await rig();
    expect(r.service.getSnapshot()).toEqual({
      items: [],
      unread: 0,
      cardDone: false,
      ready: false,
    });
    await r.store.inbox.change((state) =>
      addItems(state, [item(NOW - 60_000, true), item(NOW), item(NOW - 1_000)], NOW),
    );

    await until(() => r.service.getSnapshot().items.length === 3);
    const view = r.service.getSnapshot();
    expect(view.items.map((each) => each.at)).toEqual([NOW, NOW - 1_000, NOW - 60_000]);
    expect(view.unread).toBe(2);
    expect(view.ready).toBe(true);
    expect(r.service.getSnapshot()).toBe(view);

    await r.service.dismissCard();
    await until(() => r.service.getSnapshot().cardDone);
    r.stop();
  });

  it('marks read, marks all read, deletes and clears, writing only what changes', async () => {
    const r = await rig();
    await r.store.inbox.change((state) => addItems(state, [item(NOW), item(NOW - 1_000)], NOW));
    r.update.mockClear();

    await r.service.markRead(`300@${NOW}`);
    await r.service.markRead(`300@${NOW}`);
    expect(r.update).toHaveBeenCalledTimes(1);
    await until(() => r.service.getSnapshot().unread === 1);

    await r.service.markAllRead();
    await until(() => r.service.getSnapshot().unread === 0);
    await r.service.remove(`300@${NOW}`);
    await until(() => r.service.getSnapshot().items.length === 1);
    await r.service.clear();
    await until(() => r.service.getSnapshot().items.length === 0);
    r.update.mockClear();
    await r.service.clear();
    expect(r.update).not.toHaveBeenCalled();
    r.stop();
  });

  it('stores the switches, quiet hours and Only if I haven’t logged it', async () => {
    const r = await rig();
    await r.service.setKind('weighIn', false);
    await r.service.setKind('emptyDay', false);
    await r.service.setKind('weighIn', false);
    expect(await r.settingsRepo.get('notify.off')).toEqual(['weighIn', 'emptyDay']);
    await r.service.setKind('weighIn', true);
    expect(await r.settingsRepo.get('notify.off')).toEqual(['emptyDay']);

    await r.service.setQuiet(false);
    await r.service.setOnlyIfNotLogged(false);
    expect(await r.settingsRepo.get('notify.quiet')).toBe(false);
    expect(await r.settingsRepo.get('notify.onlyIfNotLogged')).toBe(false);
    r.stop();
  });

  it('stores Let the Coach set reminders, and cancels a check-in (P17-03, D-16.102)', async () => {
    const r = await rig();
    expect(await r.settingsRepo.get('coach.setsReminders')).toBe(true);
    await r.service.setCoachSets(false);
    expect(await r.settingsRepo.get('coach.setsReminders')).toBe(false);

    const checkIn = (id: string) => ({ id, chatId: 'c', at: NOW + 3_600_000, text: id });
    await r.settingsRepo.set('coach.checkIns', [checkIn('a'), checkIn('b')]);
    await r.service.cancelCheckIn('a');
    await r.service.cancelCheckIn('gone');
    expect(await r.settingsRepo.get('coach.checkIns')).toEqual([checkIn('b')]);
    r.stop();
  });

  it('opens a target through the app', async () => {
    const r = await rig();
    r.service.open('weight');
    expect(r.open).toHaveBeenCalledWith('weight');
    expect(EMPTY_INBOX.items).toEqual([]);
    r.stop();
  });
});

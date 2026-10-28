// The Notices service (P17-02) over a real settings repository on a test database and a stand-in
// for the notifications plugin.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import type { Clock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { channelOf, SMALL_ICON } from '../reminders/requests';
import { FakeNotificationsPlugin } from '../reminders/testing/fakeNotificationsPlugin';
import type { Notice } from './contract';
import { readDevice, SENT_KEPT_MS } from './device';
import { readInbox } from './inbox';
import { createNotices, noticeId, NOTICE_BASE_ID } from './notices';
import { createNotifyStore } from './store';

// Tests run in America/New_York. Monday 26 October 2026, 12:30.
const NOW = new Date('2026-10-26T12:30:00').getTime();
const DAY = 24 * 3_600_000;

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const sugar: Notice = {
  kind: 'sugarOver',
  title: 'Sugar limit passed',
  body: '62 g of 50 g today.',
  open: 'home',
  onceKey: 'sugarOver:2026-10-26',
};

async function rig() {
  const { db } = await openTestDb();
  opened.push(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  const plugin = new FakeNotificationsPlugin();
  let now = NOW;
  const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
  const store = createNotifyStore(settingsRepo);
  const onError = vi.fn();
  const notices = createNotices({
    show: (request) => plugin.schedule({ notifications: [request] }),
    permitted: async () => (await plugin.checkPermissions()).display === 'granted',
    settings: () => settingsRepo.snapshot(),
    store,
    clock,
    onError,
  });
  return {
    settingsRepo,
    plugin,
    notices,
    onError,
    setNow(at: number) {
      now = at;
    },
    inbox: async () => readInbox(await settingsRepo.get('notify.inbox')),
    device: async () => readDevice(await settingsRepo.get('notify.device')),
  };
}

describe('Notices.post (P17-02, D-16.101)', () => {
  it('posts at once in its own channel, opening its target, and keeps it in the inbox', async () => {
    const r = await rig();

    await expect(r.notices.post(sugar)).resolves.toBe('posted');

    expect(r.plugin.shownAtOnce).toEqual([
      {
        id: noticeId('sugarOver', NOW),
        title: sugar.title,
        body: sugar.body,
        smallIcon: SMALL_ICON,
        channelId: channelOf('sugarOver'),
        extra: { open: 'home', key: expect.any(String), kind: 'sugarOver' },
      },
    ]);
    expect((await r.inbox()).items).toEqual([
      expect.objectContaining({ kind: 'sugarOver', title: sugar.title, at: NOW, read: false }),
    ]);
  });

  it('posts a onceKey once, even when asked twice at the same moment', async () => {
    const r = await rig();

    const answers = await Promise.all([r.notices.post(sugar), r.notices.post(sugar)]);

    expect(answers.sort()).toEqual(['already', 'posted']);
    expect(r.plugin.shownAtOnce).toHaveLength(1);
    await expect(r.notices.post(sugar)).resolves.toBe('already');
    // Tomorrow's is another notice.
    r.setNow(NOW + DAY);
    await expect(r.notices.post({ ...sugar, onceKey: 'sugarOver:2026-10-27' })).resolves.toBe(
      'posted',
    );
    expect(r.plugin.shownAtOnce.map((each) => each.id)).toEqual([
      noticeId('sugarOver', NOW),
      noticeId('sugarOver', NOW + DAY),
    ]);
  });

  it('posts nothing, and records nothing, while its kind is off or Android does not allow it', async () => {
    const r = await rig();
    await r.settingsRepo.set('notify.off', ['sugarOver']);
    await expect(r.notices.post(sugar)).resolves.toBe('off');

    await r.settingsRepo.set('notify.off', []);
    r.plugin.display = 'denied';
    await expect(r.notices.post(sugar)).resolves.toBe('notAllowed');

    expect(r.plugin.shownAtOnce).toEqual([]);
    expect((await r.device()).sent).toEqual({});
    r.plugin.display = 'granted';
    await expect(r.notices.post(sugar)).resolves.toBe('posted');
  });

  it('drops a notice in quiet hours, and posts it after them when it is still true', async () => {
    const r = await rig();
    r.setNow(new Date('2026-10-26T22:15:00').getTime());
    await expect(r.notices.post(sugar)).resolves.toBe('quiet');
    expect(r.plugin.shownAtOnce).toEqual([]);

    await r.settingsRepo.set('notify.quiet', false);
    await expect(r.notices.post(sugar)).resolves.toBe('posted');
  });

  it('reports a notice Android refuses, and does not try it again', async () => {
    const r = await rig();
    const refusal = new Error('Notifications not enabled on this device');
    r.plugin.failSchedule = refusal;

    await expect(r.notices.post(sugar)).resolves.toBe('notAllowed');
    expect(r.onError).toHaveBeenCalledWith(refusal);
    expect((await r.inbox()).items).toEqual([]);
    r.plugin.failSchedule = null;
    await expect(r.notices.post(sugar)).resolves.toBe('already');
  });

  it('forgets onceKeys after 14 days', async () => {
    const r = await rig();
    await r.notices.post(sugar);
    r.setNow(NOW + SENT_KEPT_MS + 1);
    await r.notices.post({
      ...sugar,
      onceKey: 'proteinReached:2026-11-09',
      kind: 'proteinReached',
    });
    expect(Object.keys((await r.device()).sent)).toEqual(['proteinReached:2026-11-09']);
  });

  it('gives each kind 8 ids by the day, from 300, apart from the planned ones', () => {
    const ids = ['sugarOver', 'caloriesOver', 'backupFailed', 'coachCheckIn'].flatMap((kind) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((offset) =>
        noticeId(kind as Notice['kind'], NOW + offset * DAY),
      ),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(NOTICE_BASE_ID);
    expect(Math.max(...ids)).toBeLessThan(404);
  });
});

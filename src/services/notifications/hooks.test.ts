// The events behind the notices (P17-02, D-16.101) over real repositories on a test database, live
// reads, and stand-ins for `Notices` and the analysis service.

import { afterEach, describe, expect, it } from 'vitest';
import { live } from '../../data/live';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createHealthRepo } from '../../data/repos/healthRepo';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { createWalkRepo } from '../../data/repos/walkRepo';
import type { PlatewiseDb } from '../../data/schema';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import {
  FACTORY_NOW,
  makeAnalysisDraft,
  makeEntry,
  makeProfile,
  makeWalk,
} from '../../test/factories';
import type { AnalysisState } from '../analysis';
import { readDevice } from './device';
import { watchEvents } from './hooks';
import { createNotifyStore } from './store';
import { FakeNotices } from './testing/fakeNotices';

// Tests run in Node, but the app's tsconfig has no Node types: the fake IndexedDB runs on this.
declare const setImmediate: (run: () => void) => unknown;

// Monday 26 October 2026, 12:30 in New York.
const NOW = FACTORY_NOW;
const DAY = 24 * 3_600_000;

const opened: PlatewiseDb[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const db of opened.splice(0)) db.close();
});

/** Turns of the event loop until `ready` holds (the fake database answers on `setImmediate`). */
async function until(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 500 && !ready(); turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!ready()) throw new Error('until: the condition never held');
}

/** A few turns, for something that must not happen. */
async function turns(count = 60): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

class FakeAnalysis {
  state: AnalysisState = { phase: 'idle' };
  private readonly listeners = new Set<() => void>();
  getSnapshot = (): AnalysisState => this.state;
  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  };
  set(state: AnalysisState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

async function rig() {
  const { db } = await openTestDb();
  opened.push(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US' });
  const diaryRepo = createDiaryRepo(db);
  const profileRepo = createProfileRepo(db);
  const walkRepo = createWalkRepo(db);
  // A plan pinned at 2 000 kcal and 100 g protein.
  await profileRepo.save(makeProfile({ saved: { kcal: 2_000, protein: 100 } }));
  const notices = new FakeNotices();
  const analysis = new FakeAnalysis();
  let visible = true;
  const store = createNotifyStore(settingsRepo);
  const start = () =>
    stops.push(
      watchEvents({
        notices,
        store,
        clock: fixedClock(NOW, 'America/New_York'),
        visibility: { isVisible: () => visible, subscribe: () => () => undefined },
        diaryRepo,
        profileRepo,
        settingsRepo,
        walkRepo,
        activityRepo: createHealthRepo(db),
        analysis,
        live,
      }),
    );
  return {
    settingsRepo,
    diaryRepo,
    walkRepo,
    notices,
    analysis,
    start,
    hide() {
      visible = false;
    },
  };
}

describe('watchEvents: the day (P17-02)', () => {
  it('posts "sugar limit passed" once the day’s known sugar passes the limit, once a day', async () => {
    const r = await rig();
    r.start();
    await r.diaryRepo.add(makeEntry({ nutrients: { sugar: 30 } }));
    await r.diaryRepo.add(makeEntry({ nutrients: {} }));
    await turns();
    expect(r.notices.asked).toEqual([]);

    await r.diaryRepo.add(makeEntry({ nutrients: { sugar: 22 } }));
    await until(() => r.notices.posted.length === 1);
    expect(r.notices.posted[0]).toEqual({
      kind: 'sugarOver',
      title: 'Sugar limit passed',
      body: '52 g of 50 g today.',
      open: 'home',
      onceKey: 'sugarOver:2026-10-26',
    });

    await r.diaryRepo.add(makeEntry({ nutrients: { sugar: 10 } }));
    await until(() => r.notices.asked.length >= 2);
    expect(r.notices.kinds()).toEqual(['sugarOver']);
  });

  it('posts "over your calorie target" past 110 % of the goal plus the day’s walks', async () => {
    const r = await rig();
    await r.walkRepo.put(makeWalk({ startedAt: NOW - 3 * 3_600_000, activeKcal: 300 }));
    r.start();
    // 2 400 kcal: past 2 200, but the walk's 300 kcal make the target 2 300 (110 %: 2 530).
    await r.diaryRepo.add(makeEntry({ kcal: 2_400, protein: 0 }));
    await turns();
    expect(r.notices.kinds()).not.toContain('caloriesOver');

    await r.diaryRepo.add(makeEntry({ kcal: 200, protein: 0 }));
    await until(() => r.notices.kinds().includes('caloriesOver'));
    expect(r.notices.posted.find((each) => each.kind === 'caloriesOver')).toMatchObject({
      body: '2,600 of 2,300 kcal today.',
      onceKey: 'caloriesOver:2026-10-26',
    });
  });

  it('posts "protein goal reached" when the day reaches its protein target', async () => {
    const r = await rig();
    r.start();
    await r.diaryRepo.add(makeEntry({ kcal: 300, protein: 60 }));
    await turns();
    expect(r.notices.kinds()).toEqual([]);

    await r.diaryRepo.add(makeEntry({ kcal: 300, protein: 40.4 }));
    await until(() => r.notices.posted.length === 1);
    expect(r.notices.posted[0]).toMatchObject({
      kind: 'proteinReached',
      body: '100 g of 100 g today.',
      onceKey: 'proteinReached:2026-10-26',
    });
  });

  it('posts "150 active minutes" once a week, from the person’s week start', async () => {
    const r = await rig();
    r.start();
    await r.walkRepo.put(
      makeWalk({ startedAt: NOW - DAY * 0.5, briskMinutes: 100, activeKcal: 0 }),
    );
    await turns();
    expect(r.notices.kinds()).toEqual([]);

    await r.walkRepo.put(makeWalk({ startedAt: NOW - 1_000, briskMinutes: 50, activeKcal: 0 }));
    await until(() => r.notices.posted.length === 1);
    expect(r.notices.posted[0]).toMatchObject({
      kind: 'activeWeek',
      title: '150 active minutes',
      onceKey: 'activeWeek:2026-10-26',
    });
  });

  it('posts nothing after it stopped', async () => {
    const r = await rig();
    r.start();
    for (const stop of stops.splice(0)) stop();
    await r.diaryRepo.add(makeEntry({ nutrients: { sugar: 90 } }));
    await turns();
    expect(r.notices.asked).toEqual([]);
  });
});

describe('watchEvents: a meal ready to review (P17-02)', () => {
  it('posts when an analysis finishes while the app is in the background, opening the review', async () => {
    const r = await rig();
    r.start();
    const draft = makeAnalysisDraft({ createdAt: NOW });

    r.analysis.set({ phase: 'analysing', kind: 'photo', photoIds: [] });
    r.analysis.set({ phase: 'reviewReady', draft, generation: 1 });
    r.analysis.set({ phase: 'idle' });
    expect(r.notices.asked).toEqual([]);

    r.hide();
    r.analysis.set({ phase: 'analysing', kind: 'photo', photoIds: [] });
    r.analysis.set({
      phase: 'reviewReady',
      draft: { ...draft, createdAt: NOW + 1 },
      generation: 2,
    });
    await until(() => r.notices.posted.length === 1);
    expect(r.notices.posted[0]).toEqual({
      kind: 'analysisReady',
      title: 'Meal ready to review',
      body: 'Check it, then add it.',
      open: 'review',
      onceKey: `analysisReady:${NOW + 1}`,
    });

    // A food picked from a list goes straight to the review: no analysis finished.
    r.analysis.set({
      phase: 'reviewReady',
      draft: { ...draft, createdAt: NOW + 2 },
      generation: 3,
    });
    await turns(5);
    expect(r.notices.asked).toHaveLength(1);
  });
});

describe('watchEvents: backups failing (P17-02)', () => {
  const failed = (at: number) => ({
    files: [],
    lastAt: null,
    problem: { kind: 'noSpace' as const, at },
    asked: false,
  });

  it('posts on the second automatic backup in a row that failed, opening Your data', async () => {
    const r = await rig();
    r.start();
    await r.settingsRepo.set('backup.autoState', failed(NOW - 2 * DAY));
    await turns();
    expect(r.notices.asked).toEqual([]);

    await r.settingsRepo.set('backup.autoState', failed(NOW - DAY));
    await until(() => r.notices.posted.length === 1);
    expect(r.notices.posted[0]).toEqual({
      kind: 'backupFailed',
      title: 'Backups are failing',
      body: 'Two in a row failed. Tap to see why.',
      open: 'data',
      onceKey: 'backupFailed:2026-10-26',
    });
  });

  it('starts counting again after a backup that went through, and counts across restarts', async () => {
    const r = await rig();
    r.start();
    await r.settingsRepo.set('backup.autoState', failed(NOW - 3 * DAY));
    await turns();
    await r.settingsRepo.set('backup.autoState', { ...failed(0), problem: null });
    await turns();
    await r.settingsRepo.set('backup.autoState', failed(NOW - DAY));
    await turns();
    expect(r.notices.asked).toEqual([]);
    expect(readDevice(await r.settingsRepo.get('notify.device')).fails.auto).toEqual({
      at: NOW - DAY,
      count: 1,
    });

    // The app restarts; Google Drive's copy fails twice meanwhile.
    for (const stop of stops.splice(0)) stop();
    const drive = (at: number) => ({
      connected: true,
      email: null,
      lastUploadAt: null,
      problem: { kind: 'offline' as const, at },
      installId: null,
    });
    await r.settingsRepo.set('backup.drive', drive(NOW - 2 * DAY));
    r.start();
    const driveStreak = async () =>
      readDevice(await r.settingsRepo.get('notify.device')).fails.drive.count;
    for (let turn = 0; turn < 500 && (await driveStreak()) === 0; turn += 1) await turns(1);
    expect(await driveStreak()).toBe(1);
    expect(r.notices.asked).toEqual([]);
    await r.settingsRepo.set('backup.drive', drive(NOW - DAY));
    await until(() => r.notices.posted.length === 1);
    expect(r.notices.kinds()).toEqual(['backupFailed']);
  });
});

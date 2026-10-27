import { describe, expect, it, vi } from 'vitest';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createFastRepo, type FastRepo } from '../../data/repos/fastRepo';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSettingsRepo, type SettingsRepo } from '../../data/repos/settingsRepo';
import { OWNED_PREFIX } from '../../data/wipe';
import { systemClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { makeEntry, makeProfile } from '../../test/factories';
import {
  EMPTY_LOG,
  REMINDER_SETTING_KEYS,
  createReminderEngine,
  type PageVisibility,
  type ReminderNotice,
  type Timers,
} from './engine';
import {
  REMINDER_LOG_KEY,
  browserTimers,
  localReminderMemory,
  readLog,
  storedReminderSources,
  type LogStorage,
} from './ports';

// Tests run in Node, but the app's tsconfig has no Node types: the fake IndexedDB runs on this.
declare const setImmediate: (run: () => void) => unknown;

const HOUR = 3_600_000;

function local(text: string): number {
  return new Date(text).getTime();
}

async function storedRepos() {
  const { db, bus } = await openTestDb();
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
  const fastRepo = createFastRepo(db);
  const diaryRepo = createDiaryRepo(db);
  const profileRepo = createProfileRepo(db);
  return { settingsRepo, fastRepo, diaryRepo, profileRepo };
}

/** Resolves on the next call of the returned listener. */
function nextCall(): { listener: () => void; called: () => Promise<void> } {
  let resolve: () => void = () => undefined;
  let waiting = new Promise<void>((done) => (resolve = done));
  return {
    listener: () => {
      resolve();
      waiting = new Promise<void>((done) => (resolve = done));
    },
    called: () => waiting,
  };
}

/** Fake time for the engine; the fake IndexedDB keeps its real `setImmediate`. */
function useFakeClock(at: string): void {
  vi.useFakeTimers({
    now: local(at),
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
}

/**
 * Lets the fake IndexedDB and the live queries run until `ready` holds. Dexie starts each live
 * query run on a 0 ms timer, so under fake timers the timers due now run too; time never moves.
 */
async function until(ready: () => boolean): Promise<void> {
  for (let turn = 0; turn < 500 && !ready(); turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
  }
  if (!ready()) throw new Error('until: the condition never held');
}

/** The page's timers, counting the engine's own (the database keeps timers of its own). */
function countedTimers(): { timers: Timers; pending: () => number } {
  const live = new Set<unknown>();
  const timers: Timers = {
    setTimeout(run, ms) {
      const handle = browserTimers.setTimeout(() => {
        live.delete(handle);
        run();
      }, ms);
      live.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      live.delete(handle);
      browserTimers.clearTimeout(handle);
    },
  };
  return { timers, pending: () => live.size };
}

const shownPage: PageVisibility = { isVisible: () => true, subscribe: () => () => undefined };

describe('storedReminderSources', () => {
  it('reads the reminder settings once they are loaded, with the defaults filled in', async () => {
    const repos = await storedRepos();
    await repos.settingsRepo.set('remind.lunch', { on: true, at: '12:30' });
    await repos.settingsRepo.set('units.energy', 'kJ');
    const settings = await storedReminderSources(repos).settings();
    expect(Object.keys(settings).sort()).toEqual([...REMINDER_SETTING_KEYS].sort());
    expect(settings['remind.lunch']).toEqual({ on: true, at: '12:30' });
    expect(settings['remind.dinner']).toEqual({ on: false, at: '19:00' });
    expect(settings['remind.master']).toBe(false);
    expect(settings['units.energy']).toBe('kJ');
  });

  it("adds up the day's energy against the energy target in effect", async () => {
    const repos = await storedRepos();
    await repos.profileRepo.save(makeProfile({ saved: { kcal: 1_900 } }));
    await repos.diaryRepo.add(makeEntry({ kcal: 450, loggedAt: local('2026-06-10T08:10:00') }));
    await repos.diaryRepo.add(makeEntry({ kcal: 620, loggedAt: local('2026-06-10T13:05:00') }));
    await repos.diaryRepo.add(makeEntry({ kcal: 999, loggedAt: local('2026-06-09T21:00:00') }));
    expect(await storedReminderSources(repos).todayTotals('2026-06-10')).toEqual({
      eatenKcal: 1_070,
      goalKcal: 1_900,
    });
  });

  it('has no goal without a stored profile', async () => {
    const repos = await storedRepos();
    await repos.diaryRepo.add(makeEntry({ kcal: 300, loggedAt: local('2026-06-10T08:10:00') }));
    expect(await storedReminderSources(repos).todayTotals('2026-06-10')).toEqual({
      eatenKcal: 300,
      goalKcal: null,
    });
  });

  it('gives the running fast, and none once it has ended', async () => {
    const repos = await storedRepos();
    const sources = storedReminderSources(repos);
    const started = await repos.fastRepo.start(960, Date.now() - HOUR);
    if (!started.ok) throw new Error('the fast did not start');
    expect(await sources.activeFast()).toEqual(started.value);
    await repos.fastRepo.end(started.value.id, Date.now());
    expect(await sources.activeFast()).toBeNull();
  });

  it('reports a change to a reminder setting and to the running fast', async () => {
    const repos = await storedRepos();
    const calls = vi.fn();
    const { listener, called } = nextCall();
    const stop = storedReminderSources(repos).watch?.(() => {
      calls();
      listener();
    });
    // Both live queries answer once when they start.
    await until(() => calls.mock.calls.length === 2);

    let next = called();
    await repos.settingsRepo.set('remind.water', { on: true, at: '15:00' });
    await next;
    expect(calls).toHaveBeenCalledTimes(3);

    next = called();
    await repos.fastRepo.start(960, Date.now());
    await next;
    expect(calls).toHaveBeenCalledTimes(4);
    stop?.();
  });
});

describe('the engine over the stored data', () => {
  async function engineOver(repos: Awaited<ReturnType<typeof storedRepos>>) {
    const shown: ReminderNotice[] = [];
    const { timers, pending } = countedTimers();
    const engine = createReminderEngine({
      ...storedReminderSources(repos),
      clock: systemClock,
      timers,
      visibility: shownPage,
      memory: localReminderMemory(() => null),
      permitted: () => true,
      show: (notice) => shown.push(notice),
    });
    return { engine, shown, pending };
  }

  async function fastingOn(settingsRepo: SettingsRepo, fastRepo: FastRepo): Promise<void> {
    await settingsRepo.set('remind.master', true);
    await settingsRepo.set('remind.fastGoal', true);
    await fastRepo.setTracking(true, Date.now());
  }

  it('drops the goal alert when the fast is cancelled in the store (R05.20)', async () => {
    useFakeClock('2026-06-10T20:00:00');
    const repos = await storedRepos();
    await fastingOn(repos.settingsRepo, repos.fastRepo);
    const started = await repos.fastRepo.start(960, Date.now());
    if (!started.ok) throw new Error('the fast did not start');
    const { engine, shown, pending } = await engineOver(repos);
    engine.start();
    await engine.settled();
    expect(pending()).toBe(1);

    await repos.fastRepo.cancel(started.value.id);
    // The watch hears the change and the next check drops the alert and its timer.
    await until(() => pending() === 0);
    await engine.settled();
    await vi.advanceTimersByTimeAsync(17 * HOUR);
    await engine.settled();
    expect(shown).toEqual([]);
    engine.stop();
  });

  it('shows the goal of a fast left running, at its goal time (ACC-H11-1)', async () => {
    useFakeClock('2026-06-10T20:00:00');
    const repos = await storedRepos();
    await fastingOn(repos.settingsRepo, repos.fastRepo);
    await repos.fastRepo.start(16 * 60, Date.now());
    const { engine, shown } = await engineOver(repos);
    engine.start();
    await engine.settled();
    await vi.advanceTimersByTimeAsync(16 * HOUR);
    await until(() => shown.length === 1);
    expect(shown.map(({ id, dueAt }) => ({ id, dueAt }))).toEqual([
      { id: 'fastGoal', dueAt: local('2026-06-11T12:00:00') },
    ]);
    engine.stop();
  });

  it('cancels the timer when the master switch is turned off in the store (R06.10)', async () => {
    useFakeClock('2026-06-10T11:00:00');
    const repos = await storedRepos();
    await repos.settingsRepo.set('remind.master', true);
    await repos.settingsRepo.set('remind.lunch', { on: true, at: '12:00' });
    const { engine, shown, pending } = await engineOver(repos);
    engine.start();
    await engine.settled();
    expect(pending()).toBe(1);

    await repos.settingsRepo.set('remind.master', false);
    await until(() => pending() === 0);
    await engine.settled();
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    expect(shown).toEqual([]);
    engine.stop();
  });
});

describe('localReminderMemory', () => {
  function fakeStorage(): LogStorage & { items: Map<string, string> } {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
    };
  }

  it('keeps the log in localStorage under a key that erase everything removes', () => {
    const storage = fakeStorage();
    const memory = localReminderMemory(() => storage);
    expect(memory.read()).toEqual(EMPTY_LOG);
    const log = {
      daily: { lunch: { at: '12:00', since: 1_000 } },
      fast: { fast: 'fast-1', goalAt: 5_000, done: false },
    };
    memory.write(log);
    expect(REMINDER_LOG_KEY.startsWith(OWNED_PREFIX)).toBe(true);
    expect(JSON.parse(storage.items.get(REMINDER_LOG_KEY) ?? 'null')).toEqual(log);
    // Another tab, or the next visit, reads the same log.
    expect(localReminderMemory(() => storage).read()).toEqual(log);
  });

  it('reads damaged data as an empty log, keeping each mark that still reads', () => {
    expect(readLog('{')).toEqual(EMPTY_LOG);
    expect(readLog([1, 2])).toEqual(EMPTY_LOG);
    expect(
      readLog({
        daily: {
          lunch: { at: '12:00', since: 1_000 },
          dinner: { at: '7pm', since: 1_000 },
          water: { at: '14:00', since: 'later' },
          streak: { at: '21:00', since: 1_000 },
        },
        fast: { fast: 'fast-1', goalAt: 5_000 },
      }),
    ).toEqual({ daily: { lunch: { at: '12:00', since: 1_000 } }, fast: null });

    const storage = fakeStorage();
    storage.items.set(REMINDER_LOG_KEY, 'not json');
    expect(localReminderMemory(() => storage).read()).toEqual(EMPTY_LOG);
  });

  it('keeps the log in memory when the storage refuses it', () => {
    const refusing: LogStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const memory = localReminderMemory(() => refusing);
    const log = { daily: { dinner: { at: '19:00', since: 2_000 } }, fast: null };
    memory.write(log);
    expect(memory.read()).toEqual(log);

    const blocked = localReminderMemory(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    blocked.write(log);
    expect(blocked.read()).toEqual(log);
  });
});

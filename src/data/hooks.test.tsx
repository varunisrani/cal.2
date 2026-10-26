import { act, cleanup, renderHook } from '@testing-library/react';
import { Dexie } from 'dexie';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../domain/dates/dayKey';
import { formulaPlan } from '../domain/goals/formulas';
import { effectiveTargets } from '../domain/goals/targets';
import type { WaterLog } from '../domain/model';
import { fixedClock, type Clock } from '../lib/clock';
import { countRuns, openTestDb } from '../test/db';
import { FACTORY_NOW, makeCoachMessage, makeEntry, makeProfile } from '../test/factories';
import { DataProvider, type DataSources } from './DataProvider';
import { hasUnreadableData, settleQuarantine } from './guard';
import {
  useActiveFast,
  useBodyFat,
  useCoachMessages,
  useDayEntries,
  useDayWater,
  useEntriesBetween,
  useFasts,
  useProfile,
  useSavedMeals,
  useSettings,
  useTargets,
  useUnreadableFlag,
  useWeighIns,
  type LiveState,
  type TargetsRead,
} from './hooks';
import { createBodyFatRepo } from './repos/bodyFatRepo';
import { createCoachRepo } from './repos/coachRepo';
import { createDiaryRepo } from './repos/diaryRepo';
import { createFastRepo } from './repos/fastRepo';
import { createProfileRepo } from './repos/profileRepo';
import { createSavedMealsRepo } from './repos/savedMealsRepo';
import { createSettingsRepo } from './repos/settingsRepo';
import { createWaterRepo } from './repos/waterRepo';
import { createWeightRepo } from './repos/weightRepo';
import { PROFILE_KEY } from './schema';
import type { SettingKey } from './settingsSchema';

/** FACTORY_NOW's local day in the test zone, and its neighbours. */
const DAY = '2026-10-26';
const DAY_BEFORE = '2026-10-25';
const DAY_AFTER = '2026-10-27';
const DAY_MS = 24 * 60 * 60 * 1000;

const closers: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  // Unmount first, so no live query is left reading a database that is closing.
  cleanup();
  for (const close of closers.splice(0)) await close();
});

/** Real repositories over a fresh test database, and the sources a provider would hold. */
async function setUp(clock: Clock = fixedClock(FACTORY_NOW, 'America/New_York')) {
  const { db, bus } = await openTestDb();
  const repos = {
    profileRepo: createProfileRepo(db),
    settingsRepo: createSettingsRepo(db, { locale: 'en-GB', bus }),
    diaryRepo: createDiaryRepo(db),
    waterRepo: createWaterRepo(db),
    fastRepo: createFastRepo(db),
    weightRepo: createWeightRepo(db, { bus }),
    bodyFatRepo: createBodyFatRepo(db),
    savedMealsRepo: createSavedMealsRepo(db),
    coachRepo: createCoachRepo(db),
  };
  const sources: DataSources = { ...repos, unreadableFlag: () => hasUnreadableData(db), clock };
  closers.push(async () => {
    await settleQuarantine(db);
    db.close();
  });
  return { db, repos, sources };
}

/**
 * Renders a hook under a provider over `sources`, records every render's state, and waits
 * (inside act) for a state.
 */
function track<T, P>(
  sources: DataSources,
  hook: (props: P) => LiveState<T>,
  initialProps: NoInfer<P>,
) {
  const renders: LiveState<T>[] = [];
  const waiters: Array<{ matches: (state: LiveState<T>) => boolean; resolve: () => void }> = [];
  const view = renderHook(
    (props: P) => {
      const state = hook(props);
      renders.push(state);
      for (const waiter of [...waiters]) {
        if (waiter.matches(state)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve();
        }
      }
      return state;
    },
    {
      initialProps,
      wrapper: ({ children }: { children: ReactNode }) => (
        <DataProvider sources={sources}>{children}</DataProvider>
      ),
    },
  );
  return {
    ...view,
    renders,
    async until(matches: (state: LiveState<T>) => boolean): Promise<void> {
      await act(async () => {
        if (matches(view.result.current)) return;
        await new Promise<void>((resolve) => waiters.push({ matches, resolve }));
      });
    },
    /** The value of the current state, which must be ready. */
    value(): T {
      const state = view.result.current;
      if (state.status !== 'ready') throw new Error(`expected a ready state, got ${state.status}`);
      return state.value;
    },
  };
}

function ready<T>(predicate: (value: T) => boolean = () => true) {
  return (state: LiveState<T>) => state.status === 'ready' && predicate(state.value);
}

const longer = (than: number) => (rows: readonly unknown[]) => rows.length > than;

/** The sources with the day's water read replaced (to count its runs). */
function withWaterReads(
  sources: DataSources,
  byDay: (dayKey: DayKey) => Promise<WaterLog[]>,
): DataSources {
  return { ...sources, waterRepo: { byDay: (dayKey) => Dexie.Promise.resolve(byDay(dayKey)) } };
}

describe('each hook renders loading, then the stored data, and follows a write after mount (R06.3)', () => {
  it('useProfile', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useProfile(), null);
    expect(view.renders[0]).toEqual({ status: 'loading' });
    await view.until(ready());
    expect(view.value()).toEqual({ kind: 'missing' });

    const profile = makeProfile();
    await act(() => repos.profileRepo.save(profile));
    await view.until(ready((read) => read.kind === 'ok'));
    expect(view.value()).toEqual({ kind: 'ok', value: profile });
  });

  it('useSettings', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useSettings(['water.on', 'display.accent']), null);
    expect(view.renders[0]).toEqual({ status: 'loading' });
    await view.until(ready());
    expect(view.value()).toEqual({ 'water.on': false, 'display.accent': 'basil' });

    await act(() => repos.settingsRepo.set('display.accent', 'ink'));
    await view.until(ready((value) => value['display.accent'] === 'ink'));
    expect(view.value()).toEqual({ 'water.on': false, 'display.accent': 'ink' });
  });

  it('useDayEntries', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useDayEntries(DAY), null);
    expect(view.renders[0]).toEqual({ status: 'loading' });
    await view.until(ready());
    expect(view.value()).toEqual([]);

    const earlier = await act(() =>
      repos.diaryRepo.add(makeEntry({ loggedAt: FACTORY_NOW - 60_000 })),
    );
    await view.until(ready(longer(0)));
    const later = await act(() => repos.diaryRepo.add(makeEntry()));
    await view.until(ready(longer(1)));
    expect(view.value()).toEqual([later, earlier]);
  });

  it('useEntriesBetween', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useEntriesBetween(DAY_BEFORE, DAY), null);
    await view.until(ready());
    expect(view.value()).toEqual([]);

    const [before, today] = await act(() =>
      repos.diaryRepo.addMany([
        makeEntry({ loggedAt: FACTORY_NOW - DAY_MS }),
        makeEntry({ loggedAt: FACTORY_NOW }),
        makeEntry({ loggedAt: FACTORY_NOW + DAY_MS }),
      ]),
    );
    await view.until(ready(longer(0)));
    expect(view.value()).toEqual([before, today]);
  });

  it('useDayWater', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useDayWater(DAY), null);
    await view.until(ready());
    expect(view.value()).toEqual([]);

    const log = await act(() => repos.waterRepo.add({ at: FACTORY_NOW, ml: 250 }));
    await view.until(ready(longer(0)));
    expect(view.value()).toEqual([log]);
  });

  it('useFasts and useActiveFast', async () => {
    const { repos, sources } = await setUp();
    const fasts = track(sources, () => useFasts(DAY, DAY), null);
    const active = track(sources, () => useActiveFast(), null);
    await fasts.until(ready());
    await active.until(ready());
    expect(fasts.value()).toEqual([]);
    expect(active.value()).toBeNull();

    const started = await act(() => repos.fastRepo.start(960, FACTORY_NOW));
    if (!started.ok) throw new Error(`the fast did not start: ${started.error}`);
    await fasts.until(ready(longer(0)));
    await active.until(ready((fast) => fast !== null));
    expect(fasts.value()).toEqual([started.value]);
    expect(active.value()).toEqual(started.value);

    const ended = await act(() => repos.fastRepo.end(started.value.id, FACTORY_NOW + 60_000));
    if (!ended.ok) throw new Error(`the fast did not end: ${ended.error}`);
    await active.until(ready((fast) => fast === null));
    await fasts.until(ready((rows) => rows[0]?.end !== null));
    expect(fasts.value()).toEqual([ended.value]);
  });

  it('useWeighIns', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useWeighIns(DAY, DAY), null);
    await view.until(ready());
    expect(view.value()).toEqual([]);

    const { entry } = await act(() => repos.weightRepo.addWeighIn({ at: FACTORY_NOW, kg: 63.5 }));
    await view.until(ready(longer(0)));
    expect(view.value()).toEqual([entry]);
  });

  it('useBodyFat', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useBodyFat(DAY, DAY), null);
    await view.until(ready());
    expect(view.value()).toEqual([]);

    const reading = await act(() =>
      repos.bodyFatRepo.addReading({ at: FACTORY_NOW, fraction: 0.24 }),
    );
    await view.until(ready(longer(0)));
    expect(view.value()).toEqual([reading]);
  });

  it('useSavedMeals', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useSavedMeals(), null);
    await view.until(ready());
    expect(view.value()).toEqual([]);

    const toggled = await act(() => repos.savedMealsRepo.toggleFromEntry(makeEntry()));
    if (!toggled.saved) throw new Error('the meal was not saved');
    await view.until(ready(longer(0)));
    expect(view.value()).toEqual([toggled.meal]);
  });

  it('useCoachMessages', async () => {
    const { repos, sources } = await setUp();
    const view = track(sources, () => useCoachMessages(), null);
    await view.until(ready());
    expect(view.value()).toEqual([]);

    const { id: _unused, ...question } = makeCoachMessage();
    const stored = await act(() => repos.coachRepo.append(question));
    await view.until(ready(longer(0)));
    expect(view.value()).toEqual([stored]);
  });

  it('useUnreadableFlag', async () => {
    const { db, sources } = await setUp();
    const flag = track(sources, () => useUnreadableFlag(), null);
    await flag.until(ready());
    expect(flag.value()).toBe(false);

    // A water row nobody can read: the day's read drops it and keeps it aside, raising the flag.
    await db.table('water').put({ id: 'water-unreadable', dayKey: DAY, ml: 'a glass' });
    const water = track(sources, () => useDayWater(DAY), null);
    await water.until(ready());
    expect(water.value()).toEqual([]);
    await act(() => settleQuarantine(db));
    await flag.until(ready((raised) => raised));
    expect(flag.value()).toBe(true);
  });
});

describe('useSettings', () => {
  it('stays loading until the first settings snapshot has been read (R06.22)', async () => {
    const { repos, sources } = await setUp();
    await repos.settingsRepo.set('display.accent', 'ink');
    let finishLoading!: () => void;
    const loaded = new Promise<void>((resolve) => (finishLoading = resolve)).then(
      () => repos.settingsRepo.loaded,
    );
    const snapshot = vi.fn(() => repos.settingsRepo.snapshot());
    const gated: DataSources = { ...sources, settingsRepo: { snapshot, loaded } };
    const view = track(gated, () => useSettings(['display.accent']), null);

    // The same read without the gate finishes meanwhile; the gated one has not even started.
    const witness = track(sources, () => useSettings(['display.accent']), null);
    await witness.until(ready());
    expect(view.result.current).toEqual({ status: 'loading' });
    expect(snapshot).not.toHaveBeenCalled();

    finishLoading();
    await view.until(ready());
    expect(view.value()).toEqual({ 'display.accent': 'ink' });
    // The default accent was never shown on the way.
    expect(view.renders.filter((state) => state.status !== 'loading')).toEqual([
      { status: 'ready', value: { 'display.accent': 'ink' } },
    ]);
  });

  it('shows the error state when the first snapshot cannot be read', async () => {
    const { repos, sources } = await setUp();
    const failure = new Error('settings could not be read');
    const loaded = Promise.reject(failure);
    loaded.catch(() => undefined);
    const broken: DataSources = {
      ...sources,
      settingsRepo: { snapshot: repos.settingsRepo.snapshot, loaded },
    };
    const view = track(broken, () => useSettings(['water.on']), null);
    await view.until((state) => state.status === 'error');
    expect(view.result.current).toEqual({ status: 'error', error: failure });
  });

  it('keeps its query when it renders again with an equal list of keys', async () => {
    const { sources } = await setUp();
    const view = track(sources, (keys: SettingKey[]) => useSettings(keys), [
      'water.on',
      'display.accent',
    ]);
    await view.until(ready());
    const shown = view.result.current;
    view.rerender(['water.on', 'display.accent']);
    // A new query would start over from loading.
    expect(view.result.current).toBe(shown);
  });

  it('does not render again when only another setting changes', async () => {
    const { repos, sources } = await setUp();
    const counted = countRuns(() => Dexie.Promise.resolve(repos.settingsRepo.snapshot()));
    closers.push(() => counted.close());
    const counting: DataSources = {
      ...sources,
      settingsRepo: { snapshot: counted.query, loaded: repos.settingsRepo.loaded },
    };
    const view = track(counting, () => useSettings(['water.on']), null);
    await view.until(ready());
    const renders = view.renders.length;
    const runs = counted.runs();

    await act(async () => {
      await repos.settingsRepo.set('display.accent', 'ink');
      // The query re-ran for the write; its equal result was dropped.
      await counted.untilRuns(runs + 1);
    });
    expect(view.renders).toHaveLength(renders);

    await act(() => repos.settingsRepo.set('water.on', true));
    await view.until(ready((value) => value['water.on']));
    expect(view.value()).toEqual({ 'water.on': true });
  });
});

describe('useTargets', () => {
  it('has no plan before onboarding, nor for a profile that cannot be read', async () => {
    const first = await setUp();
    const missing = track(first.sources, () => useTargets(DAY), null);
    await missing.until(ready());
    expect(missing.value()).toEqual({ kind: 'missing' });

    const second = await setUp();
    await second.db.table('profile').put({ id: PROFILE_KEY, sex: 'unknown' });
    const corrupt = track(second.sources, () => useTargets(DAY), null);
    await corrupt.until(ready());
    expect(corrupt.value()).toEqual({ kind: 'corrupt' });
  });

  it('gives the formula plan and the targets in effect, and follows a saved-target change', async () => {
    const { repos, sources } = await setUp();
    const profile = makeProfile();
    await repos.profileRepo.save(profile);
    const view = track(sources, () => useTargets(DAY), null);
    await view.until(ready());
    const formula = formulaPlan(profile, DAY);
    expect(view.value()).toEqual({ kind: 'ok', profile, formula, targets: formula });

    const saved = { kcal: 1500, protein: 130 };
    const changed = await act(() => repos.profileRepo.update((current) => ({ ...current, saved })));
    const isChanged = (read: TargetsRead) => read.kind === 'ok' && read.targets.kcal === 1500;
    await view.until(ready(isChanged));
    expect(view.value()).toEqual({
      kind: 'ok',
      profile: changed,
      formula,
      targets: effectiveTargets(saved, formula),
    });
  });

  it("counts age on the day it is given, else on the provider clock's day", async () => {
    const { repos, sources } = await setUp();
    // Turns 26 on DAY_AFTER: one more year lowers the resting burn, and so the plan.
    const profile = makeProfile({ birthDate: '2000-10-27' });
    await repos.profileRepo.save(profile);
    const view = track(sources, (today: DayKey | undefined) => useTargets(today), undefined);
    await view.until(ready());
    const onClockDay = formulaPlan(profile, DAY);
    expect(view.value()).toMatchObject({ kind: 'ok', formula: onClockDay });

    view.rerender(DAY_AFTER);
    const onBirthday = formulaPlan(profile, DAY_AFTER);
    expect(onBirthday.kcal).toBeLessThan(onClockDay.kcal);
    await view.until(ready((read) => read.kind === 'ok' && read.formula.kcal === onBirthday.kcal));
    expect(view.value()).toMatchObject({ kind: 'ok', formula: onBirthday, targets: onBirthday });
  });
});

describe('subscriptions', () => {
  it('switches to the new day when the day key changes', async () => {
    const { repos, sources } = await setUp();
    const today = await repos.waterRepo.add({ at: FACTORY_NOW, ml: 250 });
    const tomorrow = await repos.waterRepo.add({ at: FACTORY_NOW + DAY_MS, ml: 400 });
    const view = track(sources, (day: DayKey) => useDayWater(day), DAY);
    await view.until(ready<WaterLog[]>((rows) => rows[0]?.id === today.id));

    view.rerender(DAY_AFTER);
    await view.until(ready<WaterLog[]>((rows) => rows[0]?.id === tomorrow.id));
    expect(view.value()).toEqual([tomorrow]);
  });

  it('stops the query when the component unmounts', async () => {
    const { repos, sources } = await setUp();
    const counted = countRuns((day: DayKey) => repos.waterRepo.byDay(day));
    closers.push(() => counted.close());
    const view = track(withWaterReads(sources, counted.query), () => useDayWater(DAY), null);
    await view.until(ready());
    view.unmount();
    const runs = counted.runs();

    // A component still mounted sees the next write; the unmounted one must not run for it.
    const witnessRuns = countRuns((day: DayKey) => repos.waterRepo.byDay(day));
    closers.push(() => witnessRuns.close());
    const witness = track(withWaterReads(sources, witnessRuns.query), () => useDayWater(DAY), null);
    await witness.until(ready());
    await act(async () => {
      await repos.waterRepo.add({ at: FACTORY_NOW, ml: 250 });
      await witnessRuns.untilRuns(2);
    });
    expect(witness.value()).toHaveLength(1);
    expect(counted.runs()).toBe(runs);
  });
});

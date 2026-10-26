// The read hooks: the only way screens read stored data. Each is one live query over one
// repository read, taken from the nearest `DataProvider`: it renders loading, then the data, and
// again after every committed write that changes it, in this tab or another (R06.3). Every hook
// returns a `LiveState`, so a screen switches on `status` ('loading' | 'ready' | 'error'); none
// suspends. No business rules live here: the repositories decide what a read returns and in which
// order, and src/domain does the arithmetic. `useGoalReached` is the one exception to the shape:
// it hears a bus message instead of reading a table.

import { Dexie } from 'dexie';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { dayKeyOf, type DayKey } from '../domain/dates/dayKey';
import { formulaPlan } from '../domain/goals/formulas';
import { effectiveTargets } from '../domain/goals/targets';
import type {
  BodyFatReading,
  CoachMessage,
  DiaryEntry,
  Fast,
  Profile,
  SavedMeal,
  Targets,
  WaterLog,
  WeighIn,
} from '../domain/model';
import { appBus } from './bus';
import { useDataSources } from './DataProvider';
import type { LiveState } from './live';
import type { ProfileRead } from './repos/profileRepo';
import type { SettingKey, Settings } from './settingsSchema';
import { useLive } from './useLive';

// Screens may not import from src/data/repos, so the types they need come from here.
export type { LiveState } from './live';
export type { ProfileRead } from './repos/profileRepo';

/** The stored profile with the plan it gives: none before onboarding or when it cannot be read. */
export type TargetsRead =
  | { kind: 'missing' }
  | { kind: 'corrupt' }
  | { kind: 'ok'; profile: Profile; formula: Targets; targets: Targets };

/** The profile: missing (before onboarding), readable, or stored but unreadable. */
export function useProfile(): LiveState<ProfileRead> {
  const { profileRepo } = useDataSources();
  return useLive(() => profileRepo.get(), [profileRepo]);
}

function pick<K extends SettingKey>(all: Settings, keys: readonly K[]): Pick<Settings, K> {
  const picked: Partial<Record<K, unknown>> = {};
  for (const key of keys) picked[key] = all[key];
  return picked as Pick<Settings, K>;
}

/**
 * The named settings, defaults filled in. Loading until the settings' first snapshot has been
 * read, so a screen never shows a default in place of a stored value (R06.22). The keys are
 * compared by content, so an array written inline is fine; a change to another setting does not
 * render again.
 */
export function useSettings<K extends SettingKey>(
  keys: readonly K[],
): LiveState<Pick<Settings, K>> {
  const { settingsRepo } = useDataSources();
  return useLive(
    // Waiting through a Dexie promise keeps the snapshot read after it inside the live query.
    () =>
      Dexie.Promise.resolve(settingsRepo.loaded)
        .then(() => settingsRepo.snapshot())
        .then((all) => pick(all, keys)),
    [settingsRepo, keys.join(' ')],
  );
}

/** The entries of one local day, newest first. */
export function useDayEntries(dayKey: DayKey): LiveState<DiaryEntry[]> {
  const { diaryRepo } = useDataSources();
  return useLive(() => diaryRepo.byDay(dayKey), [diaryRepo, dayKey]);
}

/** The entries of the local days `firstKey`…`lastKey`, oldest first. */
export function useEntriesBetween(firstKey: DayKey, lastKey: DayKey): LiveState<DiaryEntry[]> {
  const { diaryRepo } = useDataSources();
  return useLive(() => diaryRepo.between(firstKey, lastKey), [diaryRepo, firstKey, lastKey]);
}

/** The water logs of one local day, newest first. */
export function useDayWater(dayKey: DayKey): LiveState<WaterLog[]> {
  const { waterRepo } = useDataSources();
  return useLive(() => waterRepo.byDay(dayKey), [waterRepo, dayKey]);
}

/** The fasts that meet the local days `firstKey`…`lastKey` (a running one included), by start. */
export function useFasts(firstKey: DayKey, lastKey: DayKey): LiveState<Fast[]> {
  const { fastRepo } = useDataSources();
  return useLive(() => fastRepo.between(firstKey, lastKey), [fastRepo, firstKey, lastKey]);
}

/** The running fast, or null. */
export function useActiveFast(): LiveState<Fast | null> {
  const { fastRepo } = useDataSources();
  return useLive(() => fastRepo.active(), [fastRepo]);
}

/** The weigh-ins of the local days `firstKey`…`lastKey`, oldest first. */
export function useWeighIns(firstKey: DayKey, lastKey: DayKey): LiveState<WeighIn[]> {
  const { weightRepo } = useDataSources();
  return useLive(() => weightRepo.between(firstKey, lastKey), [weightRepo, firstKey, lastKey]);
}

/** The body-fat readings of the local days `firstKey`…`lastKey`, oldest first. */
export function useBodyFat(firstKey: DayKey, lastKey: DayKey): LiveState<BodyFatReading[]> {
  const { bodyFatRepo } = useDataSources();
  return useLive(() => bodyFatRepo.between(firstKey, lastKey), [bodyFatRepo, firstKey, lastKey]);
}

/** The saved meals in the person's order. */
export function useSavedMeals(): LiveState<SavedMeal[]> {
  const { savedMealsRepo } = useDataSources();
  return useLive(() => savedMealsRepo.list(), [savedMealsRepo]);
}

/** The Coach conversation, oldest first. */
export function useCoachMessages(): LiveState<CoachMessage[]> {
  const { coachRepo } = useDataSources();
  return useLive(() => coachRepo.list(), [coachRepo]);
}

function targetsOf(read: ProfileRead, today: DayKey): TargetsRead {
  if (read.kind !== 'ok') return { kind: read.kind };
  const profile = read.value;
  const formula = formulaPlan(profile, today);
  return { kind: 'ok', profile, formula, targets: effectiveTargets(profile.saved, formula) };
}

/**
 * The profile with its formula plan and the targets in effect (saved values over the formula).
 * Ages count on `today`; without one, on the provider clock's day. Screens pass `useToday()` so
 * the plan moves on at midnight with the rest of the screen.
 */
export function useTargets(today?: DayKey): LiveState<TargetsRead> {
  const { profileRepo, clock } = useDataSources();
  const day = today ?? dayKeyOf(clock.now());
  return useLive(() => profileRepo.get().then((read) => targetsOf(read, day)), [profileRepo, day]);
}

/** True once anything stored could not be read (the "some data could not be read" notice). */
export function useUnreadableFlag(): LiveState<boolean> {
  const { unreadableFlag } = useDataSources();
  return useLive(() => unreadableFlag(), [unreadableFlag]);
}

/**
 * Calls `onReached` with the weight, in kg, whenever a new weigh-in carries the weight across the
 * goal weight: the weight repository's `goal-reached` message, from whichever screen added it
 * (R01.11). Screens hear the bus only through this, never through src/data/bus.ts.
 */
export function useGoalReached(onReached: (kg: number) => void): void {
  const { bus } = useDataSources();
  const latest = useRef(onReached);
  useLayoutEffect(() => {
    latest.current = onReached;
  });
  useEffect(() => {
    const source = bus ?? appBus();
    return source.subscribe((message) => {
      if (message.type === 'goal-reached') latest.current(message.kg);
    });
  }, [bus]);
}

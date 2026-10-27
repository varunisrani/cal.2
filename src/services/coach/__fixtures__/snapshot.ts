// Snapshots for the Coach context, prompt and tool tests. The test zone is New York; "now" is the
// factory instant, Monday 26 October 2026 at 12:30, so today is 2026-10-26. A snapshot has no
// Health Connect activity (the web) unless a test gives it some.

import type { ActivityRow, ActivitySession } from '../../../data/schema';
import type { DayKey } from '../../../domain/dates/dayKey';
import type { DiaryEntry, Fast, WeighIn } from '../../../domain/model';
import {
  FACTORY_NOW,
  makeEntry,
  makeFast,
  makeProfile,
  makeWeighIn,
} from '../../../test/factories';
import type { CoachActivity, CoachSnapshot } from '../snapshot';

export const SNAPSHOT_NOW = FACTORY_NOW;
export const SNAPSHOT_TODAY: DayKey = '2026-10-26';

/** The local instant of a day and a wall-clock time in the test zone: `at('2026-10-25', '21:00')`. */
export function at(day: DayKey, time = '12:00'): number {
  return Date.parse(`${day}T${time}:00`);
}

/** An entry logged on `day` at `time`, its day key that day. */
export function entryOn(day: DayKey, time: string, changes: Partial<DiaryEntry> = {}): DiaryEntry {
  return makeEntry({ loggedAt: at(day, time), dayKey: day, ...changes });
}

export function weighInOn(day: DayKey, kg: number, time = '07:30'): WeighIn {
  return makeWeighIn({ at: at(day, time), kg });
}

/** A fast from `start` to `end` (null: still running), as instants. */
export function fastFrom(start: number, end: number | null, goalMin = 960): Fast {
  return makeFast({ start, end, goalMin });
}

/** Food names of `fixtureDiary`: none of them may reach the context or the prompt. */
export const FIXTURE_FOOD_NAMES = [
  'Grandma Rosa lasagne',
  'Matcha oat latte',
  'Kimchi fried rice',
  'Smoked mackerel bagel',
] as const;

/** Four entries over three days, two of them today, with distinctive names and a note. */
export function fixtureDiary(): DiaryEntry[] {
  const [lasagne, latte, rice, bagel] = FIXTURE_FOOD_NAMES;
  return [
    entryOn('2026-10-24', '19:10', { name: lasagne, kcal: 820, note: 'Second helping' }),
    entryOn('2026-10-25', '08:05', { name: latte, kcal: 180, protein: 6, carbs: 24, fat: 6 }),
    entryOn('2026-10-26', '08:15', { name: rice, kcal: 640, protein: 18, carbs: 92, fat: 21.5 }),
    entryOn('2026-10-26', '11:40', { name: bagel, kcal: 510, protein: 31, carbs: 48, fat: 19 }),
  ];
}

/** A workout on `day` from `time`, `minutes` long, as Health Connect's copy holds it. */
export function workoutOn(
  day: DayKey,
  time: string,
  minutes: number,
  changes: Partial<ActivitySession> = {},
): ActivitySession {
  const start = at(day, time);
  return {
    id: `hc-${day}-${time}`,
    start,
    end: start + minutes * 60_000,
    type: 'running',
    title: null,
    activeKcal: null,
    source: 'com.example.watch',
    ...changes,
  };
}

/** A stored activity day with nothing in it; `changes` fill it. */
export function activityOn(day: DayKey, changes: Partial<ActivityRow> = {}): ActivityRow {
  return {
    day,
    steps: null,
    activeKcal: null,
    totalKcal: null,
    distanceM: null,
    sessions: [],
    syncedAt: SNAPSHOT_NOW,
    ...changes,
  };
}

/** Health Connect connected, counting on unless `changes` say otherwise. */
export function connectedActivity(
  days: readonly ActivityRow[],
  changes: Partial<CoachActivity> = {},
): CoachActivity {
  return { countActive: true, days, ...changes };
}

/** A snapshot of an empty diary for the factory profile, read in kcal, kg and cm. */
export function makeSnapshot(changes: Partial<CoachSnapshot> = {}): CoachSnapshot {
  return {
    now: SNAPSHOT_NOW,
    timeZone: 'America/New_York',
    profile: makeProfile(),
    units: { energy: 'kcal', weight: 'kg', height: 'cm' },
    entries: [],
    weighIns: [],
    bodyFat: [],
    fasts: [],
    water: { on: true, goalMl: 2000, unit: 'ml', logs: [] },
    activity: null,
    ...changes,
  };
}

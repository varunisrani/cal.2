// The Coach's read-only data tools (04 §3.9, R04.10, R04.16, R04.17, R04.20): the six nutrition
// tools, and `activity_log` over Health Connect's activity copy while it is connected (D-16.94). A
// call is answered from the turn's snapshot, never from the live stores, and always as the text of
// one JSON object; a problem is an `{error}` object the model can read and correct, never a throw.
//
// Ranges are local days, inclusive at both ends. A `to` that is missing or not a real
// YYYY-MM-DD day means today, a `from` like that means 30 days before `to`, and the two swap when
// they come in the wrong order: nothing is refused, and every result repeats the range it used.
// Lists run oldest first; a limit drops the oldest rows so the newest remain (D-16.32), and says
// how many went. Day keys come from `Date`'s calendar numbers, never a locale's calendar, so the
// dates are Gregorian whatever the device's language. Entries count on their stored day key (the
// day the diary shows them on), weigh-ins and body fat on their instant's local day, fasts on
// any overlap with the range. A day without entries is simply absent: no 0 kcal rows, no fasts
// inferred from an empty day. Activity ranges default to the last 7 days and hold at most 90, the
// newest kept; a day Health Connect had nothing for is absent too, and a value it did not have is
// left out rather than written as 0.

import type { ActivityRow, ActivitySession } from '../../data/schema';
import {
  addDays,
  dayKeyOf,
  daysBetween,
  isDayKey,
  startOfDay,
  type DayKey,
} from '../../domain/dates/dayKey';
import { inDays } from '../../domain/dates/ranges';
import { EXTRA_KEYS, NUTRIENT_KEYS, type DiaryEntry, type Fast } from '../../domain/model';
import { NUTRIENT_UNITS, type MassUnit } from '../../domain/nutrients/catalogue';
import { clampFastGoal, fastDuration, goalAt } from '../../domain/trackers/fasting';
import { clamp } from '../../domain/units/numbers';
import { snapshotDay, type CoachActivity, type CoachSnapshot } from './snapshot';
import {
  ACTIVITY_DEFAULT_DAYS,
  ACTIVITY_MAX_DAYS,
  ACTIVITY_TOOL_NAME,
  DEFAULT_SPAN_DAYS,
  NUTRITION_TOOL_NAMES,
  ROW_LIMITS,
  isLaterToolName,
  isNutritionToolName,
  type NutritionToolName,
  type RowLimit,
} from './toolSchemas';

/** The arguments of one call, as the wire parsed them. */
type Args = Readonly<Record<string, unknown>>;

/** A JSON object a tool answers with. */
type Payload = Record<string, unknown>;

/** The range a call ends up with. */
export interface ToolRange {
  readonly from: DayKey;
  readonly to: DayKey;
}

const MS_PER_MINUTE = 60_000;

/** The sentence naming the tools this turn offers: activity_log only while it is connected. */
function availableTools(snapshot: CoachSnapshot): string {
  const names: string[] = [...NUTRITION_TOOL_NAMES];
  if (snapshot.activity !== null) names.push(ACTIVITY_TOOL_NAME);
  return `Available tools: ${names.join(', ')}.`;
}

// ---- Arguments ------------------------------------------------------------------------------

function argsOf(raw: unknown): Args {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Args) : {};
}

function dayArg(value: unknown): DayKey | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return isDayKey(text) ? text : undefined;
}

/**
 * The range a call asked for, with the defaults filled in and the ends in order. A missing `from`
 * is `daysBack` days before `to` (30 for the nutrition tools).
 */
export function toolRange(args: Args, today: DayKey, daysBack = DEFAULT_SPAN_DAYS): ToolRange {
  const to = dayArg(args.to) ?? today;
  const from = dayArg(args.from) ?? addDays(to, -daysBack);
  // Valid day keys are zero-padded, so text order is calendar order.
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The `limit` a call asked for, held to 1…max; the tool's own number when there is none. */
export function rowLimit(value: unknown, limit: RowLimit): number {
  let asked = Number.NaN;
  if (typeof value === 'number') asked = value;
  else if (typeof value === 'string' && value.trim() !== '') asked = Number(value);
  if (!Number.isFinite(asked)) return limit.fallback;
  return clamp(Math.trunc(asked), 1, limit.max);
}

function onDays(day: DayKey, range: ToolRange): boolean {
  return isDayKey(day) && day >= range.from && day <= range.to;
}

// ---- Values ---------------------------------------------------------------------------------

/** `value` to `digits` decimals, never -0. */
function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale + 0;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A local time with its offset, from the calendar numbers: `2026-10-25T21:00:00-04:00`. */
export function localTimestamp(ms: number): string {
  const local = new Date(ms);
  const east = -local.getTimezoneOffset();
  const sign = east < 0 ? '-' : '+';
  const offset = `${pad(Math.floor(Math.abs(east) / 60))}:${pad(Math.abs(east) % 60)}`;
  const clock = `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;
  return `${dayKeyOf(ms)}T${clock}${sign}${offset}`;
}

const UNIT_SUFFIX: Readonly<Record<MassUnit, string>> = { g: 'G', mg: 'Mg', mcg: 'Mcg' };

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// ---- Lists ----------------------------------------------------------------------------------

/**
 * A range tool's answer: the range, how many rows came back, the limit's markers when it left
 * older rows out, and the rows, oldest first. `rows` must already be oldest first.
 */
function listed(range: ToolRange, rows: readonly unknown[], limit: number): Payload {
  const items = rows.slice(Math.max(0, rows.length - limit));
  const omitted = rows.length - items.length;
  return {
    from: range.from,
    to: range.to,
    count: items.length,
    ...(omitted > 0 ? { limited: true, omittedOlder: omitted } : {}),
    items,
  };
}

/** Count, first and last day of a set of days. */
function span(days: readonly DayKey[]): Payload {
  const known = days.filter((day) => isDayKey(day)).sort();
  return {
    count: days.length,
    firstDate: known[0] ?? null,
    lastDate: known[known.length - 1] ?? null,
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sorts `rows` in place by `time`, then id, so equal instants keep one order. */
function oldestFirst<T extends { readonly id: string }>(rows: T[], time: (row: T) => number): T[] {
  return rows.sort((a, b) => time(a) - time(b) || compareText(a.id, b.id));
}

/** Entries by day key, then the time they were logged, then id. */
function entryOrder(a: DiaryEntry, b: DiaryEntry): number {
  return compareText(a.dayKey, b.dayKey) || a.loggedAt - b.loggedAt || compareText(a.id, b.id);
}

function foodRow(entry: DiaryEntry): Payload {
  const row: Payload = {
    date: entry.dayKey,
    name: entry.name,
    kcal: Math.round(entry.kcal),
    proteinG: round(entry.protein, 1),
    carbsG: round(entry.carbs, 1),
    fatG: round(entry.fat, 1),
    meal: entry.meal,
    source: entry.source,
  };
  if (entry.basis.kind === 'grams') row.weightG = round(entry.basis.grams, 1);
  else row.servings = round(entry.basis.count, 2);
  for (const key of NUTRIENT_KEYS) {
    const amount = entry.nutrients[key];
    if (isAmount(amount)) row[`${key}${UNIT_SUFFIX[NUTRIENT_UNITS[key]]}`] = round(amount, 2);
  }
  for (const key of EXTRA_KEYS) {
    const amount = entry.extras[key];
    if (isAmount(amount)) row[`${key}G`] = round(amount, 2);
  }
  return row;
}

function fastRow(fast: Fast, now: number): Payload {
  const reachedBy = fast.end ?? now;
  return {
    status: fast.end === null ? 'active' : 'completed',
    start: localTimestamp(fast.start),
    end: fast.end === null ? null : localTimestamp(fast.end),
    durationMin: Math.floor(fastDuration(fast, now) / MS_PER_MINUTE),
    goalMin: clampFastGoal(fast.goalMin),
    goalReached: reachedBy >= goalAt(fast),
  };
}

// ---- Activity ---------------------------------------------------------------------------------

/** An activity range and how many older days the 90-day cap left out of it. */
export interface ActivityRange extends ToolRange {
  readonly omittedOlderDays: number;
}

/** The range `activity_log` uses: the last 7 days by default, at most the newest 90. */
export function activityRange(args: Args, today: DayKey): ActivityRange {
  const asked = toolRange(args, today, ACTIVITY_DEFAULT_DAYS - 1);
  const earliest = addDays(asked.to, -(ACTIVITY_MAX_DAYS - 1));
  if (asked.from >= earliest) return { ...asked, omittedOlderDays: 0 };
  return { from: earliest, to: asked.to, omittedOlderDays: daysBetween(asked.from, earliest) };
}

/** True when Health Connect gave the day nothing at all. */
function emptyDay(day: ActivityRow): boolean {
  return (
    day.steps === null &&
    day.activeKcal === null &&
    day.totalKcal === null &&
    day.distanceM === null &&
    day.sessions.length === 0
  );
}

/** Whole units of a value Health Connect gave; a value it did not have is left out. */
function wholeIfKnown(row: Payload, key: string, value: number | null): void {
  if (isAmount(value)) row[key] = Math.round(value);
}

function workoutRow(session: ActivitySession): Payload {
  const row: Payload = {
    type: session.type === '' ? 'other' : session.type,
    start: localTimestamp(session.start),
    minutes: Math.round((session.end - session.start) / MS_PER_MINUTE),
  };
  wholeIfKnown(row, 'activeKcal', session.activeKcal);
  return row;
}

function activityRow(day: ActivityRow): Payload {
  const row: Payload = { date: day.day };
  wholeIfKnown(row, 'steps', day.steps);
  wholeIfKnown(row, 'activeKcal', day.activeKcal);
  wholeIfKnown(row, 'totalKcal', day.totalKcal);
  wholeIfKnown(row, 'distanceM', day.distanceM);
  row.workouts = [...day.sessions]
    .sort((a, b) => a.start - b.start || compareText(a.id, b.id))
    .map(workoutRow);
  return row;
}

/** Health Connect's days in the range, oldest first; a day with nothing in it has no row. */
function activityLog(args: Args, activity: CoachActivity, today: DayKey): Payload {
  const range = activityRange(args, today);
  const days = activity.days
    .filter((day) => onDays(day.day, range) && !emptyDay(day))
    .sort((a, b) => compareText(a.day, b.day));
  return {
    from: range.from,
    to: range.to,
    daysWithData: days.length,
    ...(range.omittedOlderDays > 0
      ? { limited: true, omittedOlderDays: range.omittedOlderDays }
      : {}),
    items: days.map(activityRow),
  };
}

// ---- The tools ------------------------------------------------------------------------------

type Tool = (args: Args, snapshot: CoachSnapshot, today: DayKey) => Payload;

const TOOLS: Readonly<Record<NutritionToolName, Tool>> = {
  data_overview(_args, snapshot, today) {
    return {
      today,
      weighIns: span(snapshot.weighIns.map((reading) => dayKeyOf(reading.at))),
      bodyFat: span(snapshot.bodyFat.map((reading) => dayKeyOf(reading.at))),
      foodEntries: span(snapshot.entries.map((entry) => entry.dayKey)),
      fasts: {
        count: snapshot.fasts.length,
        active: snapshot.fasts.some((fast) => fast.end === null),
      },
    };
  },

  weight_log(args, snapshot, today) {
    const range = toolRange(args, today);
    const inRange = snapshot.weighIns.filter((reading) => inDays(reading.at, range.from, range.to));
    const rows = oldestFirst(inRange, (reading) => reading.at).map((reading) => ({
      date: dayKeyOf(reading.at),
      kg: round(reading.kg, 1),
    }));
    return listed(range, rows, rowLimit(args.limit, ROW_LIMITS.weight_log));
  },

  body_fat_log(args, snapshot, today) {
    const range = toolRange(args, today);
    const inRange = snapshot.bodyFat.filter((reading) => inDays(reading.at, range.from, range.to));
    const rows = oldestFirst(inRange, (reading) => reading.at).map((reading) => ({
      date: dayKeyOf(reading.at),
      percent: round(reading.fraction * 100, 1),
    }));
    return listed(range, rows, rowLimit(args.limit, ROW_LIMITS.body_fat_log));
  },

  daily_energy_totals(args, snapshot, today) {
    const range = toolRange(args, today);
    const totals = new Map<DayKey, number>();
    for (const entry of snapshot.entries) {
      if (onDays(entry.dayKey, range)) {
        totals.set(entry.dayKey, (totals.get(entry.dayKey) ?? 0) + entry.kcal);
      }
    }
    const days = [...totals.keys()].sort();
    return {
      from: range.from,
      to: range.to,
      daysWithData: days.length,
      items: days.map((date) => ({ date, kcal: Math.round(totals.get(date) ?? 0) })),
    };
  },

  food_log(args, snapshot, today) {
    const range = toolRange(args, today);
    const rows = snapshot.entries
      .filter((entry) => onDays(entry.dayKey, range))
      .sort(entryOrder)
      .map(foodRow);
    return listed(range, rows, rowLimit(args.limit, ROW_LIMITS.food_log));
  },

  fasting_log(args, snapshot, today) {
    const range = toolRange(args, today);
    const opens = startOfDay(range.from);
    const closes = startOfDay(addDays(range.to, 1));
    const touching = snapshot.fasts.filter(
      (fast) => fast.start < closes && (fast.end ?? snapshot.now) >= opens,
    );
    const rows = oldestFirst(touching, (fast) => fast.start).map((fast) =>
      fastRow(fast, snapshot.now),
    );
    return listed(range, rows, rowLimit(args.limit, ROW_LIMITS.fasting_log));
  },
};

function problem(message: string): string {
  return JSON.stringify({ error: message });
}

const UNREADABLE = 'The stored data for this tool could not be read.';

/**
 * Runs one tool call against the turn's snapshot and answers with the text of one JSON object.
 * `args` is whatever the wire parsed; anything but a plain object counts as no arguments.
 */
export function runCoachTool(name: string, args: unknown, snapshot: CoachSnapshot): string {
  if (isNutritionToolName(name)) {
    try {
      return JSON.stringify(TOOLS[name](argsOf(args), snapshot, snapshotDay(snapshot)));
    } catch {
      return problem(UNREADABLE);
    }
  }
  if (name === ACTIVITY_TOOL_NAME && snapshot.activity !== null) {
    try {
      return JSON.stringify(activityLog(argsOf(args), snapshot.activity, snapshotDay(snapshot)));
    } catch {
      return problem(UNREADABLE);
    }
  }
  const available = availableTools(snapshot);
  if (name === ACTIVITY_TOOL_NAME) {
    return problem(
      `The tool "${name}" needs Health Connect, which is only in the Android app and is not ` +
        `connected here. ${available}`,
    );
  }
  if (isLaterToolName(name)) {
    return problem(`The tool "${name}" is not available in this version of the app. ${available}`);
  }
  return problem(`There is no tool called "${name}". ${available}`);
}

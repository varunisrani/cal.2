// The Coach's six read-only data tools (04 §3.9, R04.10, R04.16, R04.17, R04.20). A call is
// answered from the turn's snapshot, never from the live stores, and always as the text of one
// JSON object; a problem is an `{error}` object the model can read and correct, never a throw.
//
// Ranges are local days, inclusive at both ends. A `to` that is missing or not a real
// YYYY-MM-DD day means today, a `from` like that means 30 days before `to`, and the two swap when
// they come in the wrong order: nothing is refused, and every result repeats the range it used.
// Lists run oldest first; a limit drops the oldest rows so the newest remain (D-16.32), and says
// how many went. Day keys come from `Date`'s calendar numbers, never a locale's calendar, so the
// dates are Gregorian whatever the device's language. Entries count on their stored day key (the
// day the diary shows them on), weigh-ins and body fat on their instant's local day, fasts on
// any overlap with the range. A day without entries is simply absent: no 0 kcal rows, no fasts
// inferred from an empty day.

import { addDays, dayKeyOf, isDayKey, startOfDay, type DayKey } from '../../domain/dates/dayKey';
import { inDays } from '../../domain/dates/ranges';
import { EXTRA_KEYS, NUTRIENT_KEYS, type DiaryEntry, type Fast } from '../../domain/model';
import { NUTRIENT_UNITS, type MassUnit } from '../../domain/nutrients/catalogue';
import { clampFastGoal, fastDuration, goalAt } from '../../domain/trackers/fasting';
import { LB_PER_KG } from '../../domain/units/body';
import { clamp } from '../../domain/units/numbers';
import { snapshotDay, type CoachSnapshot } from './snapshot';
import {
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

const AVAILABLE = `Available tools: ${NUTRITION_TOOL_NAMES.join(', ')}.`;

// ---- Arguments ------------------------------------------------------------------------------

function argsOf(raw: unknown): Args {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Args) : {};
}

function dayArg(value: unknown): DayKey | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return isDayKey(text) ? text : undefined;
}

/** The range a call asked for, with the defaults filled in and the ends in order. */
export function toolRange(args: Args, today: DayKey): ToolRange {
  const to = dayArg(args.to) ?? today;
  const from = dayArg(args.from) ?? addDays(to, -DEFAULT_SPAN_DAYS);
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
      lb: round(reading.kg * LB_PER_KG, 1),
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

/**
 * Runs one tool call against the turn's snapshot and answers with the text of one JSON object.
 * `args` is whatever the wire parsed; anything but a plain object counts as no arguments.
 */
export function runCoachTool(name: string, args: unknown, snapshot: CoachSnapshot): string {
  if (isNutritionToolName(name)) {
    try {
      return JSON.stringify(TOOLS[name](argsOf(args), snapshot, snapshotDay(snapshot)));
    } catch {
      return problem('The stored data for this tool could not be read.');
    }
  }
  if (isLaterToolName(name)) {
    return problem(`The tool "${name}" is not available in this version of the app. ${AVAILABLE}`);
  }
  return problem(`There is no tool called "${name}". ${AVAILABLE}`);
}

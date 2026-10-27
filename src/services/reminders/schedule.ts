// Reminder times, what is due, and what each notice says (P09-08, D-16.41, R06.11). Pure: every
// function takes "now" and the stored values as arguments and reads no clock and no storage.
//
// A daily reminder is due at a wall-clock time in the runtime's zone. Its next time is worked out
// from the calendar day and the clock time each time it is needed, never by adding 24 hours to
// the last one, so it neither drifts nor moves an hour at a DST change. Whether one is due is
// decided against its mark: the clock time it was counted for and the instant up to which it has
// been dealt with. A reminder without a mark, or marked for another clock time (just switched on,
// or its time just moved), starts counting from now, so turning lunch on at 15:00 shows nothing
// until tomorrow's lunch. Only an occurrence of today counts: a reminder missed on an earlier day
// is dropped, not shown the morning after.
//
// The fasting goal is one occurrence per fast, at start + goal. It is armed only while that time
// is still ahead (R05.20); a fast first seen with its goal already behind it never alerts.
//
// A reminder the person wrote (P13, D-16.93) comes at its time on its weekdays, or once on its
// date, and is counted the way a daily one is: from the moment it is first seen with that timing.

import { isClockTime, type Settings } from '../../data/settingsSchema';
import { addDays, dayKeyOf, splitDayKey, type DayKey } from '../../domain/dates/dayKey';
import type { Fast } from '../../domain/model';
import { weekdayOf, type CustomReminder, type CustomTiming } from '../../domain/reminders/custom';
import { clampFastGoal, formatFast, goalAt, isActive } from '../../domain/trackers/fasting';
import { toDisplay, type EnergyDisplayUnit } from '../../domain/units/energy';
import type { MessageKey } from '../../i18n/catalogue';
import type { reminders } from '../../i18n/en/reminders';
import type { MessageParams } from '../../i18n/message';

/** The reminders at a time of day, in the order Settings lists them (D-16.41). */
export const DAILY_REMINDERS = ['breakfast', 'lunch', 'dinner', 'summary', 'water'] as const;
export type DailyReminder = (typeof DAILY_REMINDERS)[number];

/** Every reminder: the daily ones and the fasting goal. There is no streak or food-log reminder. */
export const REMINDERS = [...DAILY_REMINDERS, 'fastGoal'] as const;
export type ReminderId = (typeof REMINDERS)[number];

/** The setting that holds each daily reminder's switch and time. */
export const REMINDER_SETTING = {
  breakfast: 'remind.breakfast',
  lunch: 'remind.lunch',
  dinner: 'remind.dinner',
  summary: 'remind.summary',
  water: 'remind.water',
} as const satisfies Record<DailyReminder, keyof Settings>;

/** The notice of a reminder the person wrote: `custom-` and its id. */
export type CustomNoticeId = `custom-${string}`;

/** What a notice is for: a built-in reminder, or one the person wrote. */
export type NoticeId = ReminderId | CustomNoticeId;

export function customNoticeId(id: string): CustomNoticeId {
  return `custom-${id}`;
}

/** A daily reminder that is on, with its clock time (`HH:MM`). */
export interface TimedReminder {
  readonly id: DailyReminder;
  readonly at: string;
}

/** How far a daily reminder has been dealt with. */
export interface DailyMark {
  /** The clock time it was counted for. */
  readonly at: string;
  /** Occurrences up to this instant are done: shown, or before the reminder counted. */
  readonly since: number;
}

export type DailyMarks = Readonly<Partial<Record<DailyReminder, DailyMark>>>;

/** The fasting goal of one fast: waiting for its time, or done (shown, or never to show). */
export interface FastMark {
  readonly fast: string;
  readonly goalAt: number;
  readonly done: boolean;
}

/** A daily reminder due now, with the instant it fell due. */
export interface DueReminder {
  readonly id: DailyReminder;
  readonly dueAt: number;
}

// ---- Clock times ------------------------------------------------------------------------------

function clockParts(at: string): [hours: number, minutes: number] {
  if (!isClockTime(at)) throw new RangeError(`Not a clock time (HH:MM): ${JSON.stringify(at)}`);
  return [Number(at.slice(0, 2)), Number(at.slice(3, 5))];
}

/**
 * The instant the local clock reads `at` on `day`. A time the day skips (the hour lost when
 * summer time starts) moves forward by the gap: 02:30 on that day is 03:30. A time the day has
 * twice (the hour repeated when summer time ends) is its first one.
 */
export function clockOn(day: DayKey, at: string): number {
  const [hours, minutes] = clockParts(at);
  const { year, month, day: date } = splitDayKey(day);
  const local = new Date(0);
  local.setFullYear(year, month - 1, date);
  local.setHours(hours, minutes, 0, 0);
  return local.getTime();
}

/** The first instant after `now` at which the local clock reads `at`: today's, else tomorrow's. */
export function nextAt(at: string, now: number): number {
  const today = dayKeyOf(now);
  const todays = clockOn(today, at);
  return todays > now ? todays : clockOn(addDays(today, 1), at);
}

/** The latest instant at or before `now` at which the local clock read `at`. */
export function lastAt(at: string, now: number): number {
  const today = dayKeyOf(now);
  const todays = clockOn(today, at);
  return todays <= now ? todays : clockOn(addDays(today, -1), at);
}

// ---- Daily reminders ----------------------------------------------------------------------------

/**
 * The reminders whose time passed since they were last dealt with: one entry per reminder however
 * long ago, today's occurrence only, and never for a reminder without a mark for its time.
 */
export function due(
  reminders: readonly TimedReminder[],
  marks: DailyMarks,
  now: number,
): DueReminder[] {
  const today = dayKeyOf(now);
  const list: DueReminder[] = [];
  for (const { id, at } of reminders) {
    const mark = marks[id];
    if (!mark || mark.at !== at) continue;
    const dueAt = lastAt(at, now);
    if (dueAt > mark.since && dayKeyOf(dueAt) === today) list.push({ id, dueAt });
  }
  return list;
}

export interface DailyPlan {
  /** What to show now. */
  readonly due: DueReminder[];
  /** The marks to keep: one per reminder that is on, all counted up to now. */
  readonly marks: DailyMarks;
  /** When the next one falls due; null when none is on. */
  readonly wakeAt: number | null;
}

/** One check of the daily reminders that are on now (every other one loses its mark). */
export function planDaily(
  reminders: readonly TimedReminder[],
  marks: DailyMarks,
  now: number,
): DailyPlan {
  const kept: Partial<Record<DailyReminder, DailyMark>> = {};
  let wakeAt: number | null = null;
  for (const { id, at } of reminders) {
    kept[id] = { at, since: now };
    const next = nextAt(at, now);
    if (wakeAt === null || next < wakeAt) wakeAt = next;
  }
  return { due: due(reminders, marks, now), marks: kept, wakeAt };
}

// ---- The fasting goal ---------------------------------------------------------------------------

export interface FastGoalPlan {
  /** The goal instant when the alert is due now, else null. */
  readonly dueAt: number | null;
  /** The mark to keep; null without a running fast. */
  readonly mark: FastMark | null;
  /** When the goal falls due; null when nothing is waiting. */
  readonly wakeAt: number | null;
}

const NOTHING: FastGoalPlan = { dueAt: null, mark: null, wakeAt: null };

/**
 * One check of the fasting goal for the running fast (null when there is none, or when the alert
 * is not wanted). The mark follows the fast and its goal instant: a new fast, or an edit that moved
 * the goal, is armed when that instant is still ahead and marked done when it is not.
 */
export function planFastGoal(fast: Fast | null, mark: FastMark | null, now: number): FastGoalPlan {
  if (fast === null || !isActive(fast)) return NOTHING;
  const at = goalAt(fast);
  const same = mark !== null && mark.fast === fast.id && mark.goalAt === at;
  if (!same) {
    const ahead = at > now;
    return {
      dueAt: null,
      mark: { fast: fast.id, goalAt: at, done: !ahead },
      wakeAt: ahead ? at : null,
    };
  }
  if (mark.done) return { dueAt: null, mark, wakeAt: null };
  if (at > now) return { dueAt: null, mark, wakeAt: at };
  return { dueAt: at, mark: { ...mark, done: true }, wakeAt: null };
}

// ---- Reminders the person wrote ----------------------------------------------------------------

/** The longest a weekday set waits: today's time just passed, next week's same day. */
const WEEK = 7;

/** The first instant after `now` at which `timing` comes; null for a once reminder now past. */
export function nextOccurrence(timing: CustomTiming, now: number): number | null {
  if (timing.date !== undefined) {
    const at = clockOn(timing.date, timing.time);
    return at > now ? at : null;
  }
  const today = dayKeyOf(now);
  for (let offset = 0; offset <= WEEK; offset += 1) {
    const day = addDays(today, offset);
    if (!timing.days.includes(weekdayOf(day))) continue;
    const at = clockOn(day, timing.time);
    if (at > now) return at;
  }
  return null;
}

/** The latest instant at or before `now` at which `timing` came; null when it never has. */
export function lastOccurrence(timing: CustomTiming, now: number): number | null {
  if (timing.date !== undefined) {
    const at = clockOn(timing.date, timing.time);
    return at <= now ? at : null;
  }
  const today = dayKeyOf(now);
  for (let offset = 0; offset <= WEEK; offset += 1) {
    const day = addDays(today, -offset);
    if (!timing.days.includes(weekdayOf(day))) continue;
    const at = clockOn(day, timing.time);
    if (at <= now) return at;
  }
  return null;
}

/** A timing as one string: a reminder whose timing changed starts counting again. */
export function timingKey(timing: CustomTiming): string {
  return timing.date !== undefined
    ? `${timing.time} ${timing.date}`
    : `${timing.time} ${timing.days.join(',')}`;
}

/** How far one written reminder has been dealt with (as `DailyMark`, for its timing). */
export interface CustomMark {
  /** The timing it was counted for (`timingKey`). */
  readonly key: string;
  readonly since: number;
}

export type CustomMarks = Readonly<Record<string, CustomMark>>;

/** A written reminder due now. */
export interface DueCustom {
  readonly id: string;
  readonly text: string;
  readonly dueAt: number;
}

export interface CustomPlan {
  readonly due: DueCustom[];
  /** One mark per reminder that is on, all counted up to now. */
  readonly marks: CustomMarks;
  /** When the next one comes; null when none is ahead. */
  readonly wakeAt: number | null;
}

/**
 * One check of the written reminders that are on now, by the daily reminders' rules: due once
 * when its time passed since it was counted, today's occurrence only, never for one without a
 * mark for its timing; every other reminder loses its mark.
 */
export function planCustom(
  reminders: readonly CustomReminder[],
  marks: CustomMarks,
  now: number,
): CustomPlan {
  const today = dayKeyOf(now);
  const due: DueCustom[] = [];
  const kept: Record<string, CustomMark> = {};
  let wakeAt: number | null = null;
  for (const reminder of reminders) {
    const key = timingKey(reminder);
    const mark = marks[reminder.id];
    if (mark && mark.key === key) {
      const last = lastOccurrence(reminder, now);
      if (last !== null && last > mark.since && dayKeyOf(last) === today) {
        due.push({ id: reminder.id, text: reminder.text, dueAt: last });
      }
    }
    kept[reminder.id] = { key, since: now };
    const next = nextOccurrence(reminder, now);
    if (next !== null && (wakeAt === null || next < wakeAt)) wakeAt = next;
  }
  return { due, marks: kept, wakeAt };
}

// ---- What a notice says -------------------------------------------------------------------------

/** A key of the reminders' catalogue partition (src/i18n/en/reminders.ts). */
export type ReminderTextKey = MessageKey<typeof reminders>;

/** A notice's words as catalogue keys; the notifier renders them with `t()`. */
export interface ReminderMessage {
  readonly title: ReminderTextKey;
  readonly body: ReminderTextKey;
  readonly params?: MessageParams;
}

/** Today's energy: what was eaten, and the goal in effect (null without a readable plan). */
export interface DayTotals {
  readonly eatenKcal: number;
  readonly goalKcal: number | null;
}

/** The summary's numbers in whole display units. */
export interface SummaryNumbers {
  readonly eaten: number;
  readonly goal: number;
  readonly left: number;
}

/**
 * Eaten, goal and what is left, in the display unit. Both amounts are converted first and left is
 * their difference (never below 0), so the three numbers shown always add up in kJ too.
 */
export function summaryNumbers(
  eatenKcal: number,
  goalKcal: number,
  unit: EnergyDisplayUnit,
): SummaryNumbers {
  const eaten = toDisplay(Math.max(0, eatenKcal), unit);
  const goal = toDisplay(Math.max(0, goalKcal), unit);
  return { eaten, goal, left: Math.max(0, goal - eaten) };
}

const SUMMARY_TITLE: ReminderTextKey = 'reminders.summary.title';

/** The summary: eaten of goal and left; eaten alone without a goal; a plain line when unread. */
export function summaryMessage(totals: DayTotals | null, unit: EnergyDisplayUnit): ReminderMessage {
  if (totals === null) return { title: SUMMARY_TITLE, body: 'reminders.summary.unread' };
  const kJ = unit === 'kJ';
  const { goalKcal } = totals;
  if (goalKcal === null || !(goalKcal > 0)) {
    return {
      title: SUMMARY_TITLE,
      body: kJ ? 'reminders.summary.noGoalKJ' : 'reminders.summary.noGoalKcal',
      params: { eaten: toDisplay(Math.max(0, totals.eatenKcal), unit) },
    };
  }
  const { eaten, goal, left } = summaryNumbers(totals.eatenKcal, goalKcal, unit);
  return {
    title: SUMMARY_TITLE,
    body: kJ ? 'reminders.summary.kJ' : 'reminders.summary.kcal',
    params: { eaten, goal, left },
  };
}

const MEAL_AND_WATER = {
  breakfast: { title: 'reminders.breakfast.title', body: 'reminders.breakfast.body' },
  lunch: { title: 'reminders.lunch.title', body: 'reminders.lunch.body' },
  dinner: { title: 'reminders.dinner.title', body: 'reminders.dinner.body' },
  water: { title: 'reminders.water.title', body: 'reminders.water.body' },
} as const satisfies Record<Exclude<DailyReminder, 'summary'>, ReminderMessage>;

/** The words of a meal or water reminder. */
export function fixedMessage(id: Exclude<DailyReminder, 'summary'>): ReminderMessage {
  return MEAL_AND_WATER[id];
}

/** A written reminder's words: a plain title, and the person's own text. */
export function customMessage(text: string): ReminderMessage {
  return { title: 'reminders.custom.title', body: 'reminders.custom.body', params: { text } };
}

/** The fasting goal's words, naming the goal's length as the alert counts it ("16h", "16h 30m"). */
export function fastGoalMessage(goalMin: number): ReminderMessage {
  return {
    title: 'reminders.fastGoal.title',
    body: 'reminders.fastGoal.body',
    params: { goal: formatFast(clampFastGoal(goalMin)) },
  };
}

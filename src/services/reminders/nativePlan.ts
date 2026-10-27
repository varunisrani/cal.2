// The Android app's reminders as the system's schedule (P13, D-16.92). Pure: from the stored
// reminder settings, the running fast, the summary days' totals and "now", the list of
// notifications the system should hold. `nativeSync.ts` hands the list over.
//
// Meals and water repeat every day at their wall-clock time; the system works the next one out
// from the calendar, so it stays at that clock time across DST. A written reminder repeats on its
// weekdays (one weekly notification per day, or one daily one for all seven) or comes once on its
// date. The fasting goal is one notification at start + goal while that is still ahead. The
// summary says the day's numbers, which a repeating notification could not change, so it is
// handed over as its next 7 days, each with that day's numbers as they stand: the diary only
// changes inside the app, which hands the list over again after every change.
//
// Each notification carries, in `extra`, where a tap opens the app and a key of everything it
// says and when, so a later hand-over leaves an unchanged one alone (the system would otherwise
// take it out of the notification shade while re-scheduling it).

import { addDays, dayKeyOf, dayNumberOf, type DayKey } from '../../domain/dates/dayKey';
import type { Fast } from '../../domain/model';
import { WEEKDAYS, type CustomReminder, type Weekday } from '../../domain/reminders/custom';
import { goalAt, isActive } from '../../domain/trackers/fasting';
import {
  customRemindersOn,
  dailyRemindersOn,
  fastGoalWanted,
  type ReminderSettings,
} from './engine';
import {
  clockOn,
  customMessage,
  fastGoalMessage,
  fixedMessage,
  nextAt,
  nextOccurrence,
  summaryMessage,
  type DayTotals,
  type ReminderMessage,
} from './schedule';

/** Where a tap on a notification opens the app: Home on today, or the running fast there. */
export type OpenTarget = 'home' | 'fast';

/** The status-bar icon drawn by scripts/android/icons.py. */
export const SMALL_ICON = 'ic_stat_platewise';

/** Our notification channel, as Android's settings list it. */
export const CHANNEL_ID = 'platewise-reminders';

/** How many summaries are handed over ahead. */
export const SUMMARY_DAYS = 7;

/**
 * The notification ids. Daily ones have their own; the summary takes one of 8 by the day, so
 * the next 7 never reuse the id of today's (which may still be in the shade); a written reminder
 * takes a block of 8 (its daily or once notification, then one per weekday) at a slot worked out
 * from its id, so deleting one leaves the others' ids alone.
 */
export const NATIVE_IDS = {
  breakfast: 11,
  lunch: 12,
  dinner: 13,
  water: 15,
  summary: 20,
  fastGoal: 30,
  goalReached: 40,
  custom: 1_000,
} as const;

const SUMMARY_SLOTS = 8;
const CUSTOM_BLOCK = 8;
/** Slots for written reminders: far more than the 20 kept, so a slot is seldom taken. */
export const CUSTOM_SLOTS = 1_000;

/** When the system brings one: a clock time every day (or every week on a weekday), or once. */
export type NativeSchedule =
  | {
      readonly on: { readonly hour: number; readonly minute: number; readonly weekday?: number };
      readonly allowWhileIdle: true;
    }
  | { readonly at: Date; readonly allowWhileIdle: true };

export interface NativeExtra {
  readonly open: OpenTarget;
  /** Everything the notification says and when, as one string. */
  readonly key: string;
}

/** One notification for the system; without `schedule` it shows at once. */
export interface NativeRequest {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly schedule?: NativeSchedule;
  readonly smallIcon: string;
  readonly channelId: string;
  readonly extra: NativeExtra;
}

/** Writes a notice's words (the catalogue keys with `t()`). */
export type WriteMessage = (message: ReminderMessage) => { title: string; body: string };

export interface NativePlanInput {
  readonly settings: ReminderSettings;
  /** Android lets the app notify. */
  readonly permitted: boolean;
  /** The running fast, or null. */
  readonly fast: Fast | null;
  /** The totals of the days `summaryDays` named; a day missing or null reads as unread. */
  readonly totals: ReadonlyMap<DayKey, DayTotals | null>;
  readonly now: number;
}

/** Capacitor's weekday numbers: Sunday 1 … Saturday 7. */
export function systemWeekday(day: Weekday): number {
  return ((WEEKDAYS.indexOf(day) + 1) % 7) + 1;
}

function clockParts(at: string): { hour: number; minute: number } {
  return { hour: Number(at.slice(0, 2)), minute: Number(at.slice(3, 5)) };
}

/** The days of the summary's next 7 occurrences: from the day of the next one on. */
export function summaryDays(at: string, now: number): DayKey[] {
  const first = dayKeyOf(nextAt(at, now));
  return Array.from({ length: SUMMARY_DAYS }, (_, offset) => addDays(first, offset));
}

/** The summary's id for a day. */
export function summaryId(day: DayKey): number {
  return NATIVE_IDS.summary + (dayNumberOf(day) % SUMMARY_SLOTS);
}

/** A small, steady number for a string (FNV-1a). */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Each written reminder's first id, in list order: its slot comes from its id, and a slot already
 * taken by one earlier in the list moves to the next free one.
 */
export function customBaseIds(list: readonly CustomReminder[]): Map<string, number> {
  const taken = new Set<number>();
  const bases = new Map<string, number>();
  for (const reminder of list) {
    let slot = hashOf(reminder.id) % CUSTOM_SLOTS;
    while (taken.has(slot)) slot = (slot + 1) % CUSTOM_SLOTS;
    taken.add(slot);
    bases.set(reminder.id, NATIVE_IDS.custom + slot * CUSTOM_BLOCK);
  }
  return bases;
}

function request(
  id: number,
  words: { title: string; body: string },
  schedule: NativeSchedule | undefined,
  open: OpenTarget,
): NativeRequest {
  const when =
    schedule === undefined ? null : 'at' in schedule ? schedule.at.getTime() : schedule.on;
  const key = JSON.stringify([words.title, words.body, when, open]);
  return {
    id,
    title: words.title,
    body: words.body,
    ...(schedule ? { schedule } : {}),
    smallIcon: SMALL_ICON,
    channelId: CHANNEL_ID,
    extra: { open, key },
  };
}

const daily = (at: string): NativeSchedule => ({ on: clockParts(at), allowWhileIdle: true });
const weekly = (at: string, day: Weekday): NativeSchedule => ({
  on: { ...clockParts(at), weekday: systemWeekday(day) },
  allowWhileIdle: true,
});
const once = (at: number): NativeSchedule => ({ at: new Date(at), allowWhileIdle: true });

function customRequests(
  reminder: CustomReminder,
  base: number,
  write: WriteMessage,
  now: number,
): NativeRequest[] {
  const words = write(customMessage(reminder.text));
  if (reminder.date !== undefined) {
    const at = nextOccurrence(reminder, now);
    return at === null ? [] : [request(base, words, once(at), 'home')];
  }
  if (reminder.days.length === WEEKDAYS.length) {
    return [request(base, words, daily(reminder.time), 'home')];
  }
  return reminder.days.map((day) =>
    request(base + systemWeekday(day), words, weekly(reminder.time, day), 'home'),
  );
}

/**
 * Every notification the system should hold now: none unless the notifications switch is on and
 * Android allows them; then each reminder that is on, by the rules above.
 */
export function nativePlan(input: NativePlanInput, write: WriteMessage): NativeRequest[] {
  const { settings, fast, now } = input;
  if (!input.permitted || !settings['remind.master']) return [];
  const list: NativeRequest[] = [];

  for (const { id, at } of dailyRemindersOn(settings)) {
    if (id === 'summary') {
      for (const day of summaryDays(at, now)) {
        const message = summaryMessage(input.totals.get(day) ?? null, settings['units.energy']);
        list.push(request(summaryId(day), write(message), once(clockOn(day, at)), 'home'));
      }
      continue;
    }
    list.push(request(NATIVE_IDS[id], write(fixedMessage(id)), daily(at), 'home'));
  }

  if (fastGoalWanted(settings) && fast !== null && isActive(fast)) {
    const at = goalAt(fast);
    if (at > now) {
      const words = write(fastGoalMessage(fast.goalMin));
      list.push(request(NATIVE_IDS.fastGoal, words, once(at), 'fast'));
    }
  }

  const bases = customBaseIds(settings['remind.custom']);
  for (const reminder of customRemindersOn(settings)) {
    list.push(...customRequests(reminder, bases.get(reminder.id)!, write, now));
  }
  return list;
}

/** A notification shown at once (the goal-weight alert): same icon, channel and tap. */
export function immediateRequest(id: number, title: string, body: string): NativeRequest {
  return request(id, { title, body }, undefined, 'home');
}

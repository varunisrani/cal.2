// Reminders the person writes (D-16.93): a short text, a time of day, and either the weekdays it
// repeats on or one date. Pure rules: what a usable reminder is, how a stored list is read back,
// and the weekday of a day. When one falls due is the reminder services' business.

import { dayNumberOf, isDayKey, type DayKey } from '../dates/dayKey';

/** Weekdays as stored, Monday first. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The most reminders a person can keep. */
export const CUSTOM_REMINDER_LIMIT = 20;

/** The longest text, in characters (code points). */
export const CUSTOM_TEXT_MAX = 80;

/** When a reminder comes: on a set of weekdays (all seven: every day), or once on a date. */
export type CustomTiming =
  | { readonly time: string; readonly days: readonly Weekday[]; readonly date?: undefined }
  | { readonly time: string; readonly date: DayKey; readonly days?: undefined };

/** One stored reminder. `time` is local wall-clock `HH:MM` in 24 hours. */
export type CustomReminder = CustomTiming & {
  readonly id: string;
  readonly text: string;
  readonly on: boolean;
};

/** What a caller hands in to add or change a reminder (the Settings sheet, the Coach). */
export interface CustomReminderInput {
  readonly text: string;
  readonly time: string;
  /** The weekdays it repeats on; give this or `date`. */
  readonly days?: readonly Weekday[];
  /** The one day it comes on; give this or `days`. */
  readonly date?: DayKey;
  /** Defaults to on. */
  readonly on?: boolean;
}

/**
 * Why a reminder cannot be kept: no text, text over 80 characters, not a time of day, no weekday
 * (or one that is not a weekday), not a calendar day, both or neither of days and date, a once
 * reminder whose moment has passed, already 20 reminders, no reminder with that id.
 */
export type CustomReminderProblem =
  | 'noText'
  | 'textTooLong'
  | 'badTime'
  | 'noDays'
  | 'badDate'
  | 'daysOrDate'
  | 'past'
  | 'full'
  | 'notFound';

/** A reminder's fields checked and tidied, without its id. */
export type CheckedReminder = CustomTiming & { readonly text: string; readonly on: boolean };

export type CheckResult =
  | { readonly ok: true; readonly value: CheckedReminder }
  | { readonly ok: false; readonly problem: CustomReminderProblem };

/** True for `HH:MM` with hours 00–23 and minutes 00–59. */
export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (WEEKDAYS as readonly string[]).includes(value);
}

/** The text as kept: trimmed, every run of spaces or line breaks made one space. */
export function tidyText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** Characters as a person counts them (code points, so an emoji is one). */
export function textLength(text: string): number {
  return [...text].length;
}

/** The weekdays named in `days`, each once, Monday first; null when one is not a weekday. */
function weekdaySet(days: readonly unknown[]): Weekday[] | null {
  if (!days.every(isWeekday)) return null;
  return WEEKDAYS.filter((day) => days.includes(day));
}

/**
 * Checks what a caller hands in. Problems are reported in the order a form shows its fields:
 * text, time, then days or date. Whether a date is still ahead needs a clock: the service checks.
 */
export function checkCustomReminder(input: CustomReminderInput): CheckResult {
  const fail = (problem: CustomReminderProblem): CheckResult => ({ ok: false, problem });
  const text = typeof input.text === 'string' ? tidyText(input.text) : '';
  if (text === '') return fail('noText');
  if (textLength(text) > CUSTOM_TEXT_MAX) return fail('textTooLong');
  if (!isTimeOfDay(input.time)) return fail('badTime');
  const on = input.on ?? true;
  const hasDays = input.days !== undefined;
  const hasDate = input.date !== undefined;
  if (hasDays === hasDate) return fail('daysOrDate');
  if (hasDays) {
    const days = Array.isArray(input.days) ? weekdaySet(input.days) : null;
    if (days === null || days.length === 0) return fail('noDays');
    return { ok: true, value: { text, time: input.time, days, on } };
  }
  if (!isDayKey(input.date)) return fail('badDate');
  return { ok: true, value: { text, time: input.time, date: input.date, on } };
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOne(raw: unknown): CustomReminder | null {
  if (!isFields(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  if (typeof raw.on !== 'boolean' || typeof raw.text !== 'string') return null;
  const days = Array.isArray(raw.days) ? raw.days : undefined;
  const date = typeof raw.date === 'string' ? raw.date : undefined;
  if ((raw.days !== undefined && days === undefined) || (raw.date !== undefined && !date)) {
    return null;
  }
  const checked = checkCustomReminder({
    text: raw.text,
    time: raw.time as string,
    days,
    date,
    on: raw.on,
  });
  // A stored text must already be as the checks keep it.
  if (!checked.ok || checked.value.text !== raw.text) return null;
  return { id: raw.id, ...checked.value };
}

/**
 * A stored list as the setting reads it, or `undefined` when it cannot be used: not an array,
 * more than the limit, two reminders with one id, or any reminder that is not a usable one. A
 * list is never half read, so nothing is dropped without being kept aside.
 */
export function readCustomReminders(stored: unknown): readonly CustomReminder[] | undefined {
  if (!Array.isArray(stored) || stored.length > CUSTOM_REMINDER_LIMIT) return undefined;
  const list: CustomReminder[] = [];
  const ids = new Set<string>();
  for (const raw of stored) {
    const reminder = readOne(raw);
    if (reminder === null || ids.has(reminder.id)) return undefined;
    ids.add(reminder.id);
    list.push(reminder);
  }
  return list;
}

/** The weekday of a calendar day. */
export function weekdayOf(day: DayKey): Weekday {
  // 1970-01-01 was a Thursday, index 3 from Monday.
  const index = (((dayNumberOf(day) + 3) % 7) + 7) % 7;
  return WEEKDAYS[index]!;
}

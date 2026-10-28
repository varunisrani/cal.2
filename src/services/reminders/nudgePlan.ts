// The nudges Platewise plans by itself in the Android app (P17-01, D-16.100). Pure: from the
// stored settings, what the next 7 days hold and "now", the notifications the system should hold.
//
// Each nudge is one notification per day for the next 7 days, at a fixed clock time, and only while
// it is still true: the app plans again after every change (a log, water, a weigh-in, a setting),
// so one that is no longer needed is taken back before it comes. Today's meal check goes once the
// meal is logged; the water pace once the day is on pace; the empty day once anything is logged.
// Each needs its own switch (all on unless listed in `notify.off`) and Android's permission, not
// the reminders' switch. Quiet hours (22:00–07:00, on by default) drop a nudge that would come
// then. Each day takes one of 8 ids by its day number, so the next 7 never reuse the id of
// yesterday's, which may still be in the notification shade (scheduling an id takes that one out).
//
// The meal reminders the person turned on are planned here day by day too while "Only if I
// haven't logged it" is on, so a logged meal takes that day's back; they are the person's own
// reminders, so quiet hours never touch them.

import {
  addDays,
  dayKeyOf,
  dayNumberOf,
  daysBetween,
  type DayKey,
} from '../../domain/dates/dayKey';
import type { Fast, MealKind } from '../../domain/model';
import { isQuietAt, type NoticeKind } from '../../domain/reminders/notices';
import { clockText } from '../../domain/reminders/usualTimes';
import { goalAt, isActive } from '../../domain/trackers/fasting';
import type { ReminderSettings } from './engine';
import { once, request, type NativeRequest, type OpenTarget } from './requests';
import { clockOn, fixedMessage, type ReminderMessage } from './schedule';

/** Writes a notice's words (the catalogue keys with `t()`). */
export type WriteMessage = (message: ReminderMessage) => { title: string; body: string };

/** How many days ahead the nudges are planned (as the summary, P13). */
export const NUDGE_DAYS = 7;

/** The meals with a check and a reminder of their own. */
export const CHECKED_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type CheckedMeal = (typeof CHECKED_MEALS)[number];

/** Minutes after the usual time at which a meal not logged yet is checked. */
export const MEAL_CHECK_AFTER_MIN = 60;
/** When the water pace is looked at, and the day the pace runs over. */
export const WATER_PACE_TIMES = ['13:00', '16:00', '19:00'] as const;
export const WATER_DAY = { from: '08:00', until: '21:00' } as const;
export const EMPTY_DAY_AT = '20:30';
export const WEIGH_IN_AT = '08:30';
/** Days from the newest weigh-in to the nudge, and between nudges after it. */
export const WEIGH_IN_EVERY_DAYS = 7;

/**
 * The first id of each block. A block holds 8 ids per time of day (one per day slot): the meal
 * reminders and checks one 8 per meal, the water pace one 8 per time. P13's ids are 11–40 and
 * 1 000 and up; the event notices (`notices.ts`) take 300–403.
 */
export const NUDGE_IDS = {
  mealReminder: 100,
  mealCheck: 130,
  waterPace: 160,
  emptyDay: 190,
  weighIn: 200,
} as const;

/** Day slots: one more than the days planned, so yesterday's id is never reused today. */
export const DAY_SLOTS = 8;

/** A day's slot among the 8. */
export function daySlot(day: DayKey): number {
  return dayNumberOf(day) % DAY_SLOTS;
}

/** What one day holds, as the nudges need it. */
export interface DayLog {
  /** The meals with at least one food that day. */
  readonly meals: readonly MealKind[];
  /** The water logged that day, ml. */
  readonly waterMl: number;
  /** Anything at all is logged that day: a food or water. */
  readonly any: boolean;
}

export const EMPTY_DAY: DayLog = { meals: [], waterMl: 0, any: false };

/** What the nudges are planned from (read by `notifications/sources.ts`). */
export interface NudgeFacts {
  /** Today and the 6 days after it; a day not listed has nothing logged. */
  readonly days: ReadonlyMap<DayKey, DayLog>;
  /** Each meal's usual time (`HH:MM`) from the last 14 days, when there are enough of them. */
  readonly usual: Readonly<Partial<Record<CheckedMeal, string>>>;
  /** The newest weigh-in, epoch ms; null without one. */
  readonly lastWeighIn: number | null;
}

export interface NudgeInput {
  readonly settings: ReminderSettings;
  readonly facts: NudgeFacts;
  /** The running fast, or null: a day it is expected to fill is not an empty one. */
  readonly fast: Fast | null;
  readonly now: number;
}

/** Today and the 6 days after it. */
export function nudgeDays(now: number): DayKey[] {
  const today = dayKeyOf(now);
  return Array.from({ length: NUDGE_DAYS }, (_, offset) => addDays(today, offset));
}

function minutesOf(at: string): number {
  return Number(at.slice(0, 2)) * 60 + Number(at.slice(3, 5));
}

/** True when `loggedMl` is behind an even pace toward `goalMl` over 08:00–21:00 at `at`. */
export function waterBehind(loggedMl: number, goalMl: number, at: string): boolean {
  if (!(goalMl > 0)) return false;
  const from = minutesOf(WATER_DAY.from);
  const span = minutesOf(WATER_DAY.until) - from;
  const share = Math.min(1, Math.max(0, (minutesOf(at) - from) / span));
  return loggedMl < goalMl * share;
}

/** The meal check's time: an hour after the usual time, or after the reminder's; null past midnight. */
export function mealCheckTime(usual: string): string | null {
  const minute = minutesOf(usual) + MEAL_CHECK_AFTER_MIN;
  return minute < 24 * 60 ? clockText(minute) : null;
}

const MEAL_CHECK: Readonly<Record<CheckedMeal, ReminderMessage>> = {
  breakfast: { title: 'reminders.breakfast.title', body: 'reminders.nudge.breakfast' },
  lunch: { title: 'reminders.lunch.title', body: 'reminders.nudge.lunch' },
  dinner: { title: 'reminders.dinner.title', body: 'reminders.nudge.dinner' },
};
const WATER_PACE: ReminderMessage = {
  title: 'reminders.water.title',
  body: 'reminders.nudge.water',
};
const EMPTY: ReminderMessage = {
  title: 'reminders.nudge.emptyTitle',
  body: 'reminders.nudge.empty',
};
const WEIGH_IN: ReminderMessage = {
  title: 'reminders.nudge.weighTitle',
  body: 'reminders.nudge.weigh',
};

/** True when the person turned this kind off. */
export function kindOff(settings: ReminderSettings, kind: NoticeKind): boolean {
  return settings['notify.off'].includes(kind);
}

/** The nudges of the next 7 days that are on, still true and outside quiet hours. */
export function nudgeRequests(input: NudgeInput, write: WriteMessage): NativeRequest[] {
  const { settings, facts, fast, now } = input;
  const quiet = settings['notify.quiet'];
  const days = nudgeDays(now);
  const list: NativeRequest[] = [];
  /** Adds one when its time is ahead and not in quiet hours. */
  const add = (
    id: number,
    message: ReminderMessage,
    at: number,
    open: OpenTarget,
    kind: NoticeKind,
  ) => {
    if (at <= now || (quiet && isQuietAt(at))) return;
    list.push(request(id, write(message), once(at), open, kind));
  };
  const logOf = (day: DayKey): DayLog => facts.days.get(day) ?? EMPTY_DAY;

  if (!kindOff(settings, 'mealCheck')) {
    CHECKED_MEALS.forEach((meal, index) => {
      const usual = facts.usual[meal] ?? settings[`remind.${meal}`].at;
      const time = mealCheckTime(usual);
      if (time === null) return;
      for (const day of days) {
        if (logOf(day).meals.includes(meal)) continue;
        const id = NUDGE_IDS.mealCheck + index * DAY_SLOTS + daySlot(day);
        add(id, MEAL_CHECK[meal], clockOn(day, time), 'home', 'mealCheck');
      }
    });
  }

  const goalMl = settings['water.goalMl'];
  if (settings['water.on'] && goalMl > 0 && !kindOff(settings, 'waterPace')) {
    WATER_PACE_TIMES.forEach((time, index) => {
      for (const day of days) {
        if (!waterBehind(logOf(day).waterMl, goalMl, time)) continue;
        const id = NUDGE_IDS.waterPace + index * DAY_SLOTS + daySlot(day);
        add(id, WATER_PACE, clockOn(day, time), 'water', 'waterPace');
      }
    });
  }

  if (!kindOff(settings, 'emptyDay')) {
    for (const day of days) {
      const at = clockOn(day, EMPTY_DAY_AT);
      if (logOf(day).any) continue;
      // A fast expected to run through the evening makes an empty day on purpose.
      if (fast !== null && isActive(fast) && fast.start < at && goalAt(fast) > at) continue;
      add(NUDGE_IDS.emptyDay + daySlot(day), EMPTY, at, 'home', 'emptyDay');
    }
  }

  if (facts.lastWeighIn !== null && !kindOff(settings, 'weighIn')) {
    const weighedOn = dayKeyOf(facts.lastWeighIn);
    for (const day of days) {
      const since = daysBetween(weighedOn, day);
      if (since < WEIGH_IN_EVERY_DAYS || since % WEIGH_IN_EVERY_DAYS !== 0) continue;
      add(
        NUDGE_IDS.weighIn + daySlot(day),
        WEIGH_IN,
        clockOn(day, WEIGH_IN_AT),
        'weight',
        'weighIn',
      );
    }
  }
  return list;
}

/**
 * The meal reminders that are on, day by day for the next 7 days, leaving out each day that
 * already has the meal (Only if I haven't logged it).
 */
export function mealReminderDays(input: NudgeInput, write: WriteMessage): NativeRequest[] {
  const { settings, facts, now } = input;
  const list: NativeRequest[] = [];
  CHECKED_MEALS.forEach((meal, index) => {
    const reminder = settings[`remind.${meal}`];
    if (!reminder.on) return;
    for (const day of nudgeDays(now)) {
      const at = clockOn(day, reminder.at);
      if (at <= now || facts.days.get(day)?.meals.includes(meal)) continue;
      const id = NUDGE_IDS.mealReminder + index * DAY_SLOTS + daySlot(day);
      list.push(request(id, write(fixedMessage(meal)), once(at), 'home'));
    }
  });
  return list;
}

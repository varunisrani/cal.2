// The reminder engine (P09-08, D-16.5, R06.10, R05.20). Without a server nothing can be scheduled
// for a closed app, so reminders are worked out in the app: a check when it opens, when the page
// comes back to the front, after a stored change that may move a reminder, and on one timer set
// for the next due time while the page lives. Each check reads the stored switches afresh: the
// master switch, each reminder's own switch, the tracker it belongs to (water tracking for water,
// fasting tracking for the fasting goal) and the notification permission. Whatever is off has its
// mark dropped and no timer, so nothing shows for it and turning it back on starts counting from
// then. A reminder found due by the open or front check was missed (its time passed while the app
// was closed or asleep); the notifier shows those as a banner (P09-09). The reminders the person
// wrote (P13) are checked the same way, under the same master switch and permission. In the
// Android app this engine is not used: the system schedules every reminder (`nativeSync.ts`).
//
// The marks are written before anything shows, so a second check, or a second tab reading the same
// memory, does not show it again. Checks never overlap: one requested during a check runs after
// it, and requests that pile up meanwhile become one. `stop` (erase everything) cancels the timer
// and the listeners, and a check still reading drops what it found.

import type { Settings } from '../../data/settingsSchema';
import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type { Fast } from '../../domain/model';
import type { CustomReminder } from '../../domain/reminders/custom';
import type { Clock } from '../../lib/clock';
import {
  DAILY_REMINDERS,
  REMINDER_SETTING,
  customMessage,
  customNoticeId,
  fastGoalMessage,
  fixedMessage,
  planCustom,
  planDaily,
  planFastGoal,
  summaryMessage,
  type CustomMarks,
  type DailyMarks,
  type DailyReminder,
  type DayTotals,
  type FastMark,
  type NoticeId,
  type ReminderMessage,
  type TimedReminder,
} from './schedule';

/** The settings a check reads. */
export const REMINDER_SETTING_KEYS = [
  'remind.master',
  'remind.breakfast',
  'remind.lunch',
  'remind.dinner',
  'remind.summary',
  'remind.water',
  'remind.fastGoal',
  'remind.custom',
  'water.on',
  'fasting.on',
  'units.energy',
  // The Android app's nudges (P17): their switches, quiet hours, and the water goal they pace.
  'notify.off',
  'notify.quiet',
  'notify.onlyIfNotLogged',
  'water.goalMl',
] as const satisfies readonly (keyof Settings)[];

export type ReminderSettings = Pick<Settings, (typeof REMINDER_SETTING_KEYS)[number]>;

/** The longest the timer waits, so a moved clock or time zone is noticed within the hour. */
export const MAX_WAIT_MS = 3_600_000;

/** One timer at a time. */
export interface Timers {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Whether the page is shown, and news when that changes. */
export interface PageVisibility {
  isVisible(): boolean;
  /** Calls `onChange` on every change; returns the function that stops it. */
  subscribe(onChange: () => void): () => void;
}

/** What has been dealt with, kept on this device between visits. */
export interface ReminderLog {
  readonly daily: DailyMarks;
  readonly fast: FastMark | null;
  /** The written reminders' marks, by reminder id (none in a log from before P13). */
  readonly custom?: CustomMarks;
}

export const EMPTY_LOG: ReminderLog = { daily: {}, fast: null, custom: {} };

/** Where the log is kept. `read` must answer a fresh copy, never throw. */
export interface ReminderMemory {
  read(): ReminderLog;
  write(log: ReminderLog): void;
}

/** One reminder to show now. */
export interface ReminderNotice extends ReminderMessage {
  readonly id: NoticeId;
  /** When it fell due. */
  readonly dueAt: number;
  /** Found when the app opened or came back to the front: its time passed meanwhile. */
  readonly missed: boolean;
}

export interface ReminderEngineDeps {
  /** "Now" for every check. */
  readonly clock: Clock;
  readonly timers: Timers;
  readonly visibility: PageVisibility;
  /** The stored reminder, tracking and energy-unit settings, once they have been read. */
  settings(): Promise<ReminderSettings>;
  /** The running fast, or null. */
  activeFast(): Promise<Fast | null>;
  /** The day's energy for the summary. */
  todayTotals(day: DayKey): Promise<DayTotals>;
  /** The browser lets this app notify; read at every check. */
  permitted(): boolean;
  readonly memory: ReminderMemory;
  /** Shows one notice (system notification or banner: the notifier decides). */
  show(notice: ReminderNotice): void;
  /** Calls `onChange` after a stored change that may move a reminder; returns the stop. */
  watch?(onChange: () => void): () => void;
  /** A check that failed; defaults to the console. */
  onError?(error: unknown): void;
}

export interface ReminderEngine {
  /** Checks as on opening, then follows the page, the stored changes and the timer. */
  start(): void;
  /** Checks again now (after a restore, or a permission the page re-read). */
  refresh(): Promise<void>;
  /** Cancels the timer and the listeners; nothing shows until `start` again (erase everything). */
  stop(): void;
  /** Resolves once no check is running or waiting. */
  settled(): Promise<void>;
}

/** The daily reminders whose own switch is on (water also needs water tracking). */
export function dailyRemindersOn(settings: ReminderSettings): TimedReminder[] {
  const wanted = (id: DailyReminder): boolean => id !== 'water' || settings['water.on'];
  return DAILY_REMINDERS.filter((id) => wanted(id) && settings[REMINDER_SETTING[id]].on).map(
    (id) => ({ id, at: settings[REMINDER_SETTING[id]].at }),
  );
}

/** Whether the fasting goal alert is wanted: its switch, and fasting tracking. */
export function fastGoalWanted(settings: ReminderSettings): boolean {
  return settings['fasting.on'] && settings['remind.fastGoal'];
}

/** The written reminders whose own switch is on, in the stored order. */
export function customRemindersOn(settings: ReminderSettings): CustomReminder[] {
  return settings['remind.custom'].filter((reminder) => reminder.on);
}

function earliest(...instants: readonly (number | null)[]): number | null {
  let first: number | null = null;
  for (const at of instants) {
    if (at !== null && (first === null || at < first)) first = at;
  }
  return first;
}

function reportToConsole(error: unknown): void {
  console.error('Platewise: reminders could not be checked', error);
}

export function createReminderEngine(deps: ReminderEngineDeps): ReminderEngine {
  const { clock, timers, visibility, memory } = deps;
  const onError = deps.onError ?? reportToConsole;

  let running = false;
  // Bumped by start and stop: a check from before the bump drops what it found.
  let generation = 0;
  let timer: { handle: unknown } | null = null;
  let unsubscribe: (() => void)[] = [];
  let tail: Promise<void> = Promise.resolve();
  // A check requested but not begun, and whether any of its requests found the app returning.
  let waiting: { missed: boolean } | null = null;

  function disarm(): void {
    if (timer === null) return;
    timers.clearTimeout(timer.handle);
    timer = null;
  }

  function arm(at: number | null, now: number): void {
    disarm();
    if (at === null) return;
    const slot: { handle: unknown } = { handle: null };
    slot.handle = timers.setTimeout(
      () => {
        if (timer !== slot) return;
        timer = null;
        void request(false);
      },
      Math.max(0, at - now),
    );
    timer = slot;
  }

  async function messageFor(id: DailyReminder, settings: ReminderSettings, now: number) {
    if (id !== 'summary') return fixedMessage(id);
    let totals: DayTotals | null = null;
    try {
      totals = await deps.todayTotals(dayKeyOf(now));
    } catch (error) {
      onError(error);
    }
    return summaryMessage(totals, settings['units.energy']);
  }

  function hand(notice: ReminderNotice): void {
    try {
      deps.show(notice);
    } catch (error) {
      onError(error);
    }
  }

  async function check(missed: boolean): Promise<void> {
    const run = generation;
    const settings = await deps.settings();
    const allowed = settings['remind.master'] && deps.permitted();
    const daily = allowed ? dailyRemindersOn(settings) : [];
    const written = allowed ? customRemindersOn(settings) : [];
    const goalWanted = allowed && fastGoalWanted(settings);
    const fast = goalWanted ? await deps.activeFast() : null;
    if (run !== generation) return;

    const now = clock.now();
    const log = memory.read();
    const days = planDaily(daily, log.daily, now);
    const goal = planFastGoal(fast, log.fast, now);
    const own = planCustom(written, log.custom ?? {}, now);
    memory.write({ daily: days.marks, fast: goal.mark, custom: own.marks });
    const anyOn = daily.length > 0 || goal.mark !== null || written.length > 0;
    arm(anyOn ? earliest(days.wakeAt, goal.wakeAt, own.wakeAt, now + MAX_WAIT_MS) : null, now);

    for (const { id, dueAt } of days.due) {
      const message = await messageFor(id, settings, now);
      if (run !== generation) return;
      hand({ ...message, id, dueAt, missed });
    }
    if (goal.dueAt !== null && fast !== null) {
      hand({ ...fastGoalMessage(fast.goalMin), id: 'fastGoal', dueAt: goal.dueAt, missed });
    }
    for (const { id, text, dueAt } of own.due) {
      hand({ ...customMessage(text), id: customNoticeId(id), dueAt, missed });
    }
  }

  async function checkSafely(missed: boolean): Promise<void> {
    const run = generation;
    try {
      await check(missed);
    } catch (error) {
      onError(error);
      // Try again within the hour, unless stopped meanwhile.
      if (run === generation && running) arm(clock.now() + MAX_WAIT_MS, clock.now());
    }
  }

  function request(missed: boolean): Promise<void> {
    if (!running) return tail;
    if (waiting !== null) {
      waiting.missed ||= missed;
      return tail;
    }
    const next = { missed };
    waiting = next;
    tail = tail.then(async () => {
      if (waiting === next) waiting = null;
      if (running) await checkSafely(next.missed);
    });
    return tail;
  }

  return {
    start() {
      if (running) return;
      running = true;
      generation += 1;
      unsubscribe = [
        visibility.subscribe(() => {
          if (visibility.isVisible()) void request(true);
        }),
      ];
      if (deps.watch) unsubscribe.push(deps.watch(() => void request(false)));
      void request(true);
    },

    refresh: () => request(false),

    stop() {
      if (!running) return;
      running = false;
      generation += 1;
      waiting = null;
      disarm();
      for (const stopOne of unsubscribe) stopOne();
      unsubscribe = [];
    },

    async settled() {
      let seen: Promise<void>;
      do {
        seen = tail;
        await seen;
      } while (seen !== tail);
    },
  };
}

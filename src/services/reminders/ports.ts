// The reminder engine's ports in the running app (P09-08): what it reads from the stored data, the
// browser's timers, and its log in localStorage. The notification permission and `show` are the
// notifier's (P09-09).
//
// The log is device state: it lives under a `platewise-` key, so erase everything removes it
// (src/data/wipe.ts), and a backup never carries it (backups read the database only). A log that
// cannot be read counts as empty, which only means nothing counts as missed until the next check;
// where localStorage is blocked or full the log lives in memory for the session.

import { live } from '../../data/live';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import type { FastRepo } from '../../data/repos/fastRepo';
import type { ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import { isClockTime, type Settings } from '../../data/settingsSchema';
import { formulaPlan } from '../../domain/goals/formulas';
import { effectiveTargets } from '../../domain/goals/targets';
import {
  EMPTY_LOG,
  REMINDER_SETTING_KEYS,
  type ReminderEngineDeps,
  type ReminderLog,
  type ReminderMemory,
  type ReminderSettings,
  type Timers,
} from './engine';
import { DAILY_REMINDERS, type DailyMark, type DailyReminder, type FastMark } from './schedule';

/** The localStorage key of the log. */
export const REMINDER_LOG_KEY = 'platewise-reminders';

// ---- Stored data --------------------------------------------------------------------------------

export interface ReminderRepos {
  readonly settingsRepo: Pick<SettingsRepo, 'loaded' | 'snapshot'>;
  readonly fastRepo: Pick<FastRepo, 'active'>;
  readonly diaryRepo: Pick<DiaryRepo, 'byDay'>;
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
}

function reminderSettings(all: Settings): ReminderSettings {
  const picked: Partial<Record<keyof ReminderSettings, unknown>> = {};
  for (const key of REMINDER_SETTING_KEYS) picked[key] = all[key];
  return picked as ReminderSettings;
}

/**
 * The engine's reads from the repositories: the reminder settings (once the first snapshot is
 * in), the running fast, the day's eaten energy against the energy target in effect, and a watch
 * that reports every change to the reminder settings or the running fast, from any screen, the
 * restore or another tab (live queries, R06.3).
 */
export function storedReminderSources(
  repos: ReminderRepos,
): Pick<ReminderEngineDeps, 'settings' | 'activeFast' | 'todayTotals' | 'watch'> {
  const { settingsRepo, fastRepo, diaryRepo, profileRepo } = repos;
  return {
    async settings() {
      await settingsRepo.loaded;
      return reminderSettings(await settingsRepo.snapshot());
    },

    activeFast: () => fastRepo.active(),

    async todayTotals(day) {
      const [entries, profile] = await Promise.all([diaryRepo.byDay(day), profileRepo.get()]);
      const eatenKcal = entries.reduce((sum, entry) => sum + entry.kcal, 0);
      if (profile.kind !== 'ok') return { eatenKcal, goalKcal: null };
      const plan = effectiveTargets(profile.value.saved, formulaPlan(profile.value, day));
      return { eatenKcal, goalKcal: plan.kcal };
    },

    watch(onChange) {
      const sources = [
        live(() => settingsRepo.snapshot().then(reminderSettings)),
        live(() => fastRepo.active()),
      ];
      const stops = sources.map((source) =>
        source.subscribe(() => {
          if (source.getSnapshot().status === 'ready') onChange();
        }),
      );
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}

// ---- Browser ------------------------------------------------------------------------------------

/** The page's timers, looked up at each call (so test clocks apply). */
export const browserTimers: Timers = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The part of localStorage the log uses. */
export interface LogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): LogStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading `localStorage` throws where the browser blocks site storage.
    return null;
  }
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInstant(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readDailyMark(raw: unknown): DailyMark | null {
  if (!isFields(raw) || !isClockTime(raw.at) || !isInstant(raw.since)) return null;
  return { at: raw.at, since: raw.since };
}

function readFastMark(raw: unknown): FastMark | null {
  if (!isFields(raw)) return null;
  const { fast, goalAt, done } = raw;
  if (typeof fast !== 'string' || !isInstant(goalAt) || typeof done !== 'boolean') return null;
  return { fast, goalAt, done };
}

/** A stored log as the engine reads it: unusable marks are dropped one by one. */
export function readLog(raw: unknown): ReminderLog {
  if (!isFields(raw)) return EMPTY_LOG;
  const daily: Partial<Record<DailyReminder, DailyMark>> = {};
  if (isFields(raw.daily)) {
    for (const id of DAILY_REMINDERS) {
      const mark = readDailyMark(raw.daily[id]);
      if (mark) daily[id] = mark;
    }
  }
  return { daily, fast: readFastMark(raw.fast) };
}

function parseLog(text: string | null): ReminderLog {
  if (text === null) return EMPTY_LOG;
  try {
    return readLog(JSON.parse(text));
  } catch {
    return EMPTY_LOG;
  }
}

/**
 * The log in localStorage (`platewise-reminders`). Once the storage is missing or refuses a read
 * or a write, the log lives in memory for the rest of the session.
 */
export function localReminderMemory(
  storage: () => LogStorage | null = browserStorage,
): ReminderMemory {
  let kept: string | null = null;
  let inMemory = false;
  return {
    read() {
      if (!inMemory) {
        try {
          const store = storage();
          if (store) return parseLog(store.getItem(REMINDER_LOG_KEY));
        } catch {
          // Blocked: fall back to memory below.
        }
        inMemory = true;
      }
      return parseLog(kept);
    },
    write(log) {
      kept = JSON.stringify(log);
      if (inMemory) return;
      try {
        const store = storage();
        if (store) {
          store.setItem(REMINDER_LOG_KEY, kept);
          return;
        }
      } catch {
        // Full or blocked: fall back to memory below.
      }
      inMemory = true;
    },
  };
}

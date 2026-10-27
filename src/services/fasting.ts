// Fasting's writes (P07-07): start, end, cancel, edit and delete a fast, the tracking switch and
// the default goal, and "End fast and log" (D-16.35). Every fast change is one transaction in the
// fast repository, checked there against the stored fasts by the fasting rules; a refusal comes
// back as a value and changes nothing (R05.3). "Now" is the service's clock. Turning tracking off
// ends a running fast in the same transaction as the switch, so a hidden fast never keeps food
// locked (R05.2). "End fast and log" ends the running fast and stores the food in one transaction
// (`diaryRepo.endFastAndAdd`): both happen or neither. The goal alert is P09's.

import type { DiaryEntry, Fast, NutritionDraft } from '../domain/model';
import { clampFastGoal, type FastEdits } from '../domain/trackers/fasting';
import type { DiaryRepo } from '../data/repos/diaryRepo';
import type { FastChanges, FastRepo, FastResult } from '../data/repos/fastRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { Clock } from '../lib/clock';
import { newId as randomId, type IdSource } from '../lib/ids';
import { entryFrom, type LogContext } from './diary';

export type { FastChanges, FastResult } from '../data/repos/fastRepo';
export type { FastEdits, FastRefusal } from '../domain/trackers/fasting';

export type EndFastAndLogResult =
  /** The entry is stored; `endedFast` is the fast this ended (null when none was running). */
  | { readonly kind: 'logged'; readonly entry: DiaryEntry; readonly endedFast: Fast | null }
  /** Another "End fast and log" was still being written: this call did nothing. */
  | { readonly kind: 'ignored' };

export interface FastingService {
  /** Starts a fast now with `goalMin` (clamped). Refused while one runs or when it would overlap. */
  start(goalMin: number): Promise<FastResult>;
  /** Ends the running fast `id` now (never before its start). */
  end(id: string): Promise<FastResult>;
  /** Deletes the running fast `id`: it never shows in history. */
  cancel(id: string): Promise<FastResult>;
  /** The editor's Save: start, end (finished fasts) and goal; a running fast stays running. */
  edit(id: string, changes: FastChanges): Promise<FastResult>;
  /** The editor's "End fast now": its start and goal and the end, in one write. */
  endNow(id: string, edits: FastEdits): Promise<FastResult>;
  /** Deletes any stored fast. */
  remove(id: string): Promise<FastResult>;
  /** Fasting tracking on or off; off ends the running fast, kept in history. Resolves with it. */
  setTracking(on: boolean): Promise<readonly Fast[]>;
  /** The goal a new fast starts with, in minutes (clamped to 1 h – 7 days); resolves as stored. */
  setDefaultGoal(minutes: number): Promise<number>;
  /**
   * The paused dialog's "End fast and log": ends the running fast now and logs `draft` as a new
   * entry, both or neither. Rejects when the write fails; the next call may then try again.
   */
  endFastAndLog(draft: NutritionDraft, ctx: LogContext): Promise<EndFastAndLogResult>;
}

export interface FastingDeps {
  readonly fastRepo: Pick<
    FastRepo,
    'start' | 'end' | 'cancel' | 'edit' | 'endNow' | 'remove' | 'setTracking'
  >;
  readonly diaryRepo: Pick<DiaryRepo, 'endFastAndAdd'>;
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
  /** Where "now" comes from: starts, ends and the switch. */
  readonly clock: Clock;
  /** Ids for new entries; defaults to random UUIDs. */
  readonly newId?: IdSource;
  /** Called once, after the first entry this service logs (D-16.8). Its failures are dropped. */
  readonly onFirstEntry?: () => unknown;
}

export function createFastingService(deps: FastingDeps): FastingService {
  const { fastRepo, diaryRepo, settingsRepo, clock, onFirstEntry } = deps;
  const newId = deps.newId ?? randomId;
  let logging = false;
  let loggedOnce = false;

  function afterFirstEntry(): void {
    if (loggedOnce) return;
    loggedOnce = true;
    if (!onFirstEntry) return;
    // Best effort, as in the diary service: it must never undo or fail the log.
    try {
      Promise.resolve(onFirstEntry()).catch(() => undefined);
    } catch {
      // Dropped on purpose, as above.
    }
  }

  return {
    start: (goalMin) => fastRepo.start(goalMin, clock.now()),
    end: (id) => fastRepo.end(id, clock.now()),
    cancel: (id) => fastRepo.cancel(id),
    edit: (id, changes) => fastRepo.edit(id, changes),
    endNow: (id, edits) => fastRepo.endNow(id, edits, clock.now()),
    remove: (id) => fastRepo.remove(id),
    setTracking: (on) => fastRepo.setTracking(on, clock.now()),
    setDefaultGoal: (minutes) => settingsRepo.set('fasting.defaultGoalMin', clampFastGoal(minutes)),

    async endFastAndLog(draft, ctx) {
      if (logging) return { kind: 'ignored' };
      // Taken before the first await, so a call in the same tick already sees it.
      logging = true;
      try {
        const { entry, endedFast } = await diaryRepo.endFastAndAdd(
          entryFrom(draft, ctx, newId()),
          clock.now(),
        );
        afterFirstEntry();
        return { kind: 'logged', entry, endedFast };
      } finally {
        logging = false;
      }
    },
  };
}

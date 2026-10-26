// Fasts: one running at a time, never overlapping, with a goal of 1 hour to 7 days.
//
// These functions only decide. The fast repository (src/data/repos/fastRepo.ts) reads the stored
// list, asks one of them, and writes the record it gets back inside the same transaction, so a
// check and its write can never see two different lists (R05.3). A refusal is a value, never a
// thrown error, and nothing is written for it.
//
// Intervals are half-open: a fast covers [start, end), and a running fast's end is +∞. So a fast
// that ends at 10:00 and one that starts at 10:00 do not overlap.

import { err, ok, type Result } from '../../lib/result';
import type { Fast } from '../model';
import { clamp } from '../units/numbers';

/** Shortest goal: 1 hour. */
export const MIN_GOAL_MIN = 60;
/** Longest goal: 7 days. */
export const MAX_GOAL_MIN = 7 * 24 * 60;
/** The default goal when nothing (or nothing usable) is stored: 16 hours. */
export const DEFAULT_GOAL_MIN = 16 * 60;

const MS_PER_MIN = 60_000;

/** Why a fast could not be started, edited or ended. */
export type FastRefusal =
  | 'missing' // the fast is no longer in the stored list
  | 'ended' // "end now" on a fast that already has an end
  | 'active' // another fast is running
  | 'overlap'; // the interval would intersect another fast

/**
 * A goal length held to 60–10 080 whole minutes. Applied wherever a goal is created, edited or
 * read, including the stored default. Anything that is not a finite number becomes the default.
 */
export function clampGoalMin(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_GOAL_MIN;
  return clamp(Math.round(minutes), MIN_GOAL_MIN, MAX_GOAL_MIN);
}

/** The stored default goal as the start chooser should see it. */
export function readDefaultGoalMin(stored: unknown): number {
  return typeof stored === 'number' ? clampGoalMin(stored) : DEFAULT_GOAL_MIN;
}

/** A fast runs until it has an end. */
export function isActive(fast: Fast): boolean {
  return fast.end === null;
}

/** The running fast, if any. Should two ever be stored, the one that started last wins. */
export function activeFast(fasts: readonly Fast[]): Fast | undefined {
  let found: Fast | undefined;
  for (const fast of fasts) {
    if (isActive(fast) && (found === undefined || fast.start >= found.start)) found = fast;
  }
  return found;
}

/** Milliseconds from the start to the end (or to `now` while running); never below 0. */
export function fastLengthMs(fast: Fast, now: number): number {
  return Math.max(0, (fast.end ?? now) - fast.start);
}

/** Whole minutes fasted so far (floored). */
export function fastMinutes(fast: Fast, now: number): number {
  return Math.floor(fastLengthMs(fast, now) / MS_PER_MIN);
}

/** The instant the goal is reached: start + the (clamped) goal. */
export function goalAt(fast: Fast): number {
  return fast.start + clampGoalMin(fast.goalMin) * MS_PER_MIN;
}

/** Splits a length into whole hours and the minutes left, floored; negative counts as 0. */
export function splitMinutes(minutes: number): { hours: number; minutes: number } {
  const whole = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}

function endOf(fast: Pick<Fast, 'end'>): number {
  return fast.end ?? Number.POSITIVE_INFINITY;
}

/** True when the two half-open intervals share an instant; a running fast reaches to +∞. */
export function overlaps(a: Pick<Fast, 'start' | 'end'>, b: Pick<Fast, 'start' | 'end'>): boolean {
  return a.start < endOf(b) && b.start < endOf(a);
}

/** True when `candidate` overlaps any stored fast other than itself (matched by id). */
function hitsAnother(fasts: readonly Fast[], candidate: Fast): boolean {
  return fasts.some((other) => other.id !== candidate.id && overlaps(candidate, other));
}

/** Whether a fast may start at `now`: none may be running, and [now, ∞) must be free. */
export function canStart(fasts: readonly Fast[], now: number): Result<true, FastRefusal> {
  if (activeFast(fasts) !== undefined) return err('active');
  const opening = { start: now, end: null };
  if (fasts.some((fast) => overlaps(opening, fast))) return err('overlap');
  return ok(true);
}

/** The new running fast to store, or why none may start. The caller supplies the id. */
export function startFast(
  fasts: readonly Fast[],
  id: string,
  goalMin: number,
  now: number,
): Result<Fast, FastRefusal> {
  const allowed = canStart(fasts, now);
  if (!allowed.ok) return allowed;
  return ok({ id, start: now, end: null, goalMin: clampGoalMin(goalMin) });
}

/**
 * Checks an edited fast against the stored list and returns the record to store: the fast must
 * still exist, it may be running only when no other fast is, an end before the start becomes the
 * start, the goal is clamped, and it may not overlap any other fast.
 */
export function checkEdit(fasts: readonly Fast[], edited: Fast): Result<Fast, FastRefusal> {
  if (!fasts.some((fast) => fast.id === edited.id)) return err('missing');
  if (edited.end === null && fasts.some((fast) => fast.id !== edited.id && isActive(fast))) {
    return err('active');
  }
  const fixed: Fast = {
    ...edited,
    end: edited.end === null ? null : Math.max(edited.end, edited.start),
    goalMin: clampGoalMin(edited.goalMin),
  };
  return hitsAnother(fasts, fixed) ? err('overlap') : ok(fixed);
}

/** What the editor of a running fast may change before ending it. */
export type RunningFastEdits = Partial<Pick<Fast, 'start' | 'goalMin'>>;

/**
 * "End fast now" from the editor: the edited start and goal and the end at `now` (never before
 * the start) as one record, so the edit and the end are written together or not at all.
 */
export function endNow(
  fasts: readonly Fast[],
  id: string,
  edits: RunningFastEdits,
  now: number,
): Result<Fast, FastRefusal> {
  const stored = fasts.find((fast) => fast.id === id);
  if (stored === undefined) return err('missing');
  if (!isActive(stored)) return err('ended');
  const start = edits.start ?? stored.start;
  const ended: Fast = {
    id,
    start,
    end: Math.max(now, start),
    goalMin: clampGoalMin(edits.goalMin ?? stored.goalMin),
  };
  return hitsAnother(fasts, ended) ? err('overlap') : ok(ended);
}

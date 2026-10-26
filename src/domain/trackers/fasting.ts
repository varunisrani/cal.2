// Fasting rules as pure checks over the stored list of fasts. At most one fast runs at a time, and
// no two fasts share any stretch of time: spans are half-open, so a fast may begin exactly when
// another ended, and a running fast reaches to infinity. Each check takes the whole list as stored
// and returns either the fast to write or the reason it is refused, so the fasting repository
// (P02-09) can check and write in one transaction and a refusal changes nothing (R05.3). Nothing
// here reads a clock: `now` is a parameter.

import { err, ok, type Result } from '../../lib/result';
import type { Fast } from '../model';

/** A fast's goal is at least an hour and at most a week, in whole minutes. */
export const FAST_GOAL_MIN_MINUTES = 60;
export const FAST_GOAL_MAX_MINUTES = 10_080;

/** The goal a new fast is offered when none is set: 16 hours. */
export const DEFAULT_FAST_GOAL_MINUTES = 960;

const MS_PER_MINUTE = 60_000;

/**
 * Whole goal minutes inside 60–10 080. Used wherever a fast or the default goal is created,
 * edited or read. A value that is not a finite number becomes the 16-hour default.
 */
export function clampFastGoal(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_FAST_GOAL_MINUTES;
  return Math.min(FAST_GOAL_MAX_MINUTES, Math.max(FAST_GOAL_MIN_MINUTES, Math.round(minutes)));
}

/** The stored default goal setting as read: a number is clamped, anything else is the default. */
export function decodeFastGoal(stored: unknown): number {
  return typeof stored === 'number' ? clampFastGoal(stored) : DEFAULT_FAST_GOAL_MINUTES;
}

/** A fast runs until it has an end. */
export function isActive(fast: Fast): boolean {
  return fast.end === null;
}

/** The instant the goal is reached: start + the (clamped) goal. */
export function goalAt(fast: Fast): number {
  return fast.start + clampFastGoal(fast.goalMin) * MS_PER_MINUTE;
}

/** Milliseconds from the start to the end, or to `now` while running; never below 0. */
export function fastDuration(fast: Fast, now: number): number {
  return Math.max(0, (fast.end ?? now) - fast.start);
}

/** The running fast (the latest-starting one, should the list ever hold two), or null. */
export function activeFast(fasts: readonly Fast[]): Fast | null {
  let running: Fast | null = null;
  for (const fast of fasts) {
    if (isActive(fast) && (running === null || fast.start >= running.start)) running = fast;
  }
  return running;
}

function endOf(fast: Pick<Fast, 'end'>): number {
  return fast.end ?? Number.POSITIVE_INFINITY;
}

/** True when the half-open spans [start, end) of two fasts meet; a running fast never ends. */
export function overlaps(a: Pick<Fast, 'start' | 'end'>, b: Pick<Fast, 'start' | 'end'>): boolean {
  return a.start < endOf(b) && b.start < endOf(a);
}

/**
 * Why a change to the fasts is refused: `active` – another fast is running; `overlap` – the span
 * would meet another fast; `missing` – the fast is no longer stored; `notActive` – the fast to end
 * has already ended.
 */
export type FastRefusal = 'active' | 'overlap' | 'missing' | 'notActive';

/** True when `candidate` meets any stored fast other than itself. */
function clashes(fasts: readonly Fast[], candidate: Fast): boolean {
  return fasts.some((other) => other.id !== candidate.id && overlaps(other, candidate));
}

/**
 * Whether a fast may start at `now`: refused while one is running, or when a stored fast ends
 * after `now` (the new, open-ended fast would meet it). Null means it may start.
 */
export function canStart(fasts: readonly Fast[], now: number): FastRefusal | null {
  if (activeFast(fasts) !== null) return 'active';
  const probe = { start: now, end: null };
  return fasts.some((fast) => overlaps(fast, probe)) ? 'overlap' : null;
}

/** A fast starting at `now` with a clamped goal; check `canStart` first. */
export function newFast(id: string, goalMin: number, now: number): Fast {
  return { id, start: now, end: null, goalMin: clampFastGoal(goalMin) };
}

/**
 * Validates an edited fast against the stored list. The fast must still be stored; it may be
 * made (or stay) running only while no other fast runs; an end before the start moves up to the
 * start; the goal is clamped; it must not meet another fast. Returns the fast to write.
 */
export function checkEdit(fasts: readonly Fast[], edited: Fast): Result<Fast, FastRefusal> {
  if (!fasts.some((fast) => fast.id === edited.id)) return err('missing');
  const checked: Fast = {
    id: edited.id,
    start: edited.start,
    end: edited.end === null ? null : Math.max(edited.end, edited.start),
    goalMin: clampFastGoal(edited.goalMin),
  };
  if (isActive(checked) && fasts.some((fast) => fast.id !== checked.id && isActive(fast))) {
    return err('active');
  }
  return clashes(fasts, checked) ? err('overlap') : ok(checked);
}

/** Changes "End fast now" may carry from the editor. */
export type FastEdits = Partial<Pick<Fast, 'start' | 'goalMin'>>;

/**
 * Ends the running fast `id` at `now` together with the editor's changes, as one result to write
 * in one step (R05.3): the new start and goal apply, the end is `now` but never before the start,
 * and the ended fast must not meet another one. Both happen or neither.
 */
export function endNow(
  fasts: readonly Fast[],
  id: string,
  edits: FastEdits,
  now: number,
): Result<Fast, FastRefusal> {
  const stored = fasts.find((fast) => fast.id === id);
  if (stored === undefined) return err('missing');
  if (!isActive(stored)) return err('notActive');
  const start = edits.start ?? stored.start;
  const ended: Fast = {
    id,
    start,
    end: Math.max(now, start),
    goalMin: clampFastGoal(edits.goalMin ?? stored.goalMin),
  };
  return clashes(fasts, ended) ? err('overlap') : ok(ended);
}

/**
 * A fast length as short text from whole minutes (fractions dropped): "45m", "16h", "16h 30m".
 * Unit letters only; anything below a minute, negative or not a number reads "0m".
 */
export function formatFast(minutes: number): string {
  const whole = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

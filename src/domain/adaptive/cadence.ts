// The weekly tune-up's decisions (D-16.45): the same AI plan as a rebuild, at most once every 7
// calendar days. This module only decides; the runner (src/services/goals/tuneUp.ts) reads and
// writes storage, calls the AI and keeps runs single-flight. The reference's unused deterministic
// weekly corrector is not built.
//
// Rules worth knowing:
// - a failed run still marks the week checked, so a broken key is not hit on every open, but only
//   while the tune-up is still on and the switches did not change (R01.5);
// - a result is dropped when the profile changed in any way while the call ran (R01.4);
// - the plan the person had before the first tune-up change is stored once and given back when
//   the tune-up is switched off (R01.14).

import { daysBetween, isDayKey, type DayKey } from '../dates/dayKey';
import { applyPlan, clearLocks } from '../goals/locks';
import type { Profile, SavedTargets, Targets } from '../model';
import { sameProfile } from '../profile/profile';

/** Calendar days between automatic runs. */
export const TUNE_UP_EVERY_DAYS = 7;

/** Other on/off settings a run depends on (none in v1; measured energy later), by name. */
export type TuneUpSwitches = Readonly<Record<string, boolean>>;

/** The stored on/off setting: absent (or unreadable) reads as on. */
export function readTuneUpOn(stored: unknown): boolean {
  return typeof stored === 'boolean' ? stored : true;
}

/**
 * Due when no day was ever stored, the stored value is not a day key, or `today` is at least 7
 * calendar days after it. A stored day after today (the clock moved back) is not due.
 */
export function isDue(lastCheckDay: unknown, today: DayKey): boolean {
  if (!isDayKey(lastCheckDay)) return true;
  return daysBetween(lastCheckDay, today) >= TUNE_UP_EVERY_DAYS;
}

/** What asks for a decision. */
export type TuneUpTrigger =
  | 'open' // the app started
  | 'visible' // the page came back to the foreground
  | 'enable' // the person switched the tune-up on
  | 'manualRebuildDone' // a rebuild from Settings succeeded
  | 'onboardingDone'; // the wizard finished

export interface TuneUpState {
  on: boolean;
  /** The stored last-check day, as read (it may be missing or unreadable). */
  lastCheckDay: unknown;
  today: DayKey;
}

export type TuneUpDecision =
  | { kind: 'run'; forced: boolean; clearLocks: boolean }
  | { kind: 'skip'; why: 'off' | 'notDue' }
  | { kind: 'markChecked'; day: DayKey };

/**
 * Open and visible run when on and due. Switching on clears locks and runs whatever the due
 * rule says. A successful rebuild marks today when on, so the tune-up does not repeat the same AI
 * call straight after it. Finishing onboarding marks today, so the first run lands a week later.
 */
export function decide(state: TuneUpState, trigger: TuneUpTrigger): TuneUpDecision {
  switch (trigger) {
    case 'enable':
      return { kind: 'run', forced: true, clearLocks: true };
    case 'onboardingDone':
      return { kind: 'markChecked', day: state.today };
    case 'manualRebuildDone':
      return state.on ? { kind: 'markChecked', day: state.today } : { kind: 'skip', why: 'off' };
    case 'open':
    case 'visible':
      if (!state.on) return { kind: 'skip', why: 'off' };
      return isDue(state.lastCheckDay, state.today)
        ? { kind: 'run', forced: false, clearLocks: false }
        : { kind: 'skip', why: 'notDue' };
  }
}

/** What the runner noted when a run started. */
export interface RunStart {
  today: DayKey;
  profile: Profile;
  switches: TuneUpSwitches;
}

/** What storage holds now (before the AI call, or after it returned). */
export interface RunNow {
  on: boolean;
  /** Undefined when the profile is gone. */
  profile: Profile | undefined;
  switches: TuneUpSwitches;
  /** The pre-tune-up plan, when one is stored. */
  savedPlan: SavedTargets | undefined;
}

export type RunOutcome = { kind: 'failed' } | { kind: 'planned'; plan: Targets };

export type Settlement =
  /** Switched off or a switch changed while the run went on: nothing applied, nothing marked. */
  | { kind: 'abort' }
  /** The AI call failed: goals stay, the week is marked checked. */
  | { kind: 'markChecked'; day: DayKey }
  /** A plan came back but the profile changed meanwhile: nothing applied, nothing marked. */
  | { kind: 'drop' }
  /** Store `profile`, `savedPlan` and `lastCheckDay`. */
  | { kind: 'apply'; profile: Profile; savedPlan: SavedTargets; lastCheckDay: DayKey };

function sameSwitches(a: TuneUpSwitches, b: TuneUpSwitches): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...names].every((name) => a[name] === b[name]);
}

/** True while the run should go on: the tune-up is still on and no switch changed. */
export function stillWanted(start: RunStart, now: RunNow): boolean {
  return now.on && sameSwitches(start.switches, now.switches);
}

/**
 * What to do with a finished AI call. The day marked is the day the run started. On success the
 * targets saved before the first tune-up change are stored only when none are stored yet; the new
 * plan replaces all four targets and clears every lock.
 */
export function settle(start: RunStart, now: RunNow, outcome: RunOutcome): Settlement {
  if (!stillWanted(start, now)) return { kind: 'abort' };
  if (outcome.kind === 'failed') return { kind: 'markChecked', day: start.today };
  if (now.profile === undefined || !sameProfile(now.profile, start.profile)) {
    return { kind: 'drop' };
  }
  return {
    kind: 'apply',
    profile: applyPlan(now.profile, outcome.plan),
    savedPlan: now.savedPlan ?? { ...now.profile.saved },
    lastCheckDay: start.today,
  };
}

/** Switching on: locks are cleared first, since the tune-up owns the targets while on. */
export function turnOn(profile: Profile): Profile {
  return clearLocks(profile);
}

/**
 * Switching off: the stored pre-tune-up plan (if any) goes back onto the profile; the caller then
 * deletes it. Locks are not part of the stored plan.
 */
export function turnOff(
  profile: Profile,
  savedPlan: SavedTargets | undefined,
): { profile: Profile; savedPlan: undefined } {
  if (savedPlan === undefined) return { profile, savedPlan: undefined };
  return { profile: { ...profile, saved: { ...savedPlan } }, savedPlan: undefined };
}

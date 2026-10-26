// The weekly tune-up's decisions (D-16.45): when a check is due, what each trigger does, what a
// reply does once it arrives, and what turning the switch on or off does. Pure: the runner
// (P05-09) reads the stored state, calls the AI, writes what these functions return, and keeps
// the single-flight flag. "Today" is always a parameter. The tune-up re-runs the AI plan only; no
// formula correction is built (R01.1).

import { daysBetween, isDayKey, type DayKey } from '../dates/dayKey';
import type { Profile, SavedTargets, Targets } from '../model';
import { sameProfile } from '../profile/profile';

/** A check is due once this many calendar days have passed since the last one. */
export const TUNE_UP_EVERY_DAYS = 7;

/** The stored tune-up settings: `tuneUp.on`, `tuneUp.lastCheckDay`, `tuneUp.savedPlan`. */
export interface TuneUpState {
  readonly on: boolean;
  /** The day of the last check as stored; anything that is not a day key means "never". */
  readonly lastCheckDay: DayKey | null;
  /**
   * The saved targets from before the tune-up first changed them, put back when the switch goes
   * off. `null` means nothing is kept; `{}` keeps a plan whose targets were all automatic.
   */
  readonly savedPlan: SavedTargets | null;
}

/**
 * True when a check is due: never checked (or a stored day that cannot be read), or at least
 * seven calendar days since the last check.
 */
export function isDue(lastCheckDay: unknown, today: DayKey): boolean {
  if (!isDayKey(lastCheckDay)) return true;
  return daysBetween(lastCheckDay, today) >= TUNE_UP_EVERY_DAYS;
}

/**
 * What can start a decision: the app opening or coming back to the front, the switch being
 * turned on (a forced run), a manual rebuild that succeeded, and onboarding finishing.
 */
export type TuneUpTrigger = 'open' | 'visible' | 'enable' | 'manualRebuildDone' | 'onboardingDone';

export interface TuneUpContext {
  readonly today: DayKey;
  /** Onboarding is finished and a profile exists. */
  readonly ready: boolean;
  /** A run started earlier has not settled yet. */
  readonly running: boolean;
}

export type SkipReason = 'off' | 'notReady' | 'running' | 'notDue';

export type TuneUpDecision =
  | { readonly kind: 'run'; readonly forced: boolean }
  | { readonly kind: 'skip'; readonly reason: SkipReason }
  | { readonly kind: 'markChecked'; readonly state: TuneUpState };

function markedOn(state: TuneUpState, today: DayKey): TuneUpState {
  return { ...state, lastCheckDay: today };
}

/**
 * The decision for a trigger. Open and visible run when the switch is on, the person is set up,
 * no run is in flight and a check is due; enable runs even when not due. A manual rebuild that
 * succeeded counts as this week's check while the switch is on, so the same tap never causes a
 * second AI call; finishing onboarding counts as a check too (R01.5).
 */
export function plan(
  state: TuneUpState,
  trigger: TuneUpTrigger,
  context: TuneUpContext,
): TuneUpDecision {
  if (trigger === 'onboardingDone') {
    return { kind: 'markChecked', state: markedOn(state, context.today) };
  }
  if (!state.on) return { kind: 'skip', reason: 'off' };
  if (trigger === 'manualRebuildDone') {
    return { kind: 'markChecked', state: markedOn(state, context.today) };
  }
  if (!context.ready) return { kind: 'skip', reason: 'notReady' };
  if (context.running) return { kind: 'skip', reason: 'running' };
  const forced = trigger === 'enable';
  if (!forced && !isDue(state.lastCheckDay, context.today)) {
    return { kind: 'skip', reason: 'notDue' };
  }
  return { kind: 'run', forced };
}

function withoutLocks(profile: Profile): Profile {
  return { ...profile, caloriesLocked: false, lockedMacros: [] };
}

/** What turning the switch on writes, and the forced run that follows. */
export interface TurnOnResult {
  readonly state: TuneUpState;
  /** The profile with every lock cleared, or null when there is nothing to write. */
  readonly profile: Profile | null;
  readonly decision: TuneUpDecision;
}

/**
 * Turning the switch on: the tune-up owns the targets from now on, so every lock is cleared first,
 * then a run is forced whether or not a check is due.
 */
export function turnOn(
  state: TuneUpState,
  profile: Profile | null,
  context: TuneUpContext,
): TurnOnResult {
  const next: TuneUpState = { ...state, on: true };
  const locked = profile !== null && (profile.caloriesLocked || profile.lockedMacros.length > 0);
  return {
    state: next,
    profile: locked ? withoutLocks(profile) : null,
    decision: plan(next, 'enable', context),
  };
}

/** What turning the switch off writes. */
export interface TurnOffResult {
  readonly state: TuneUpState;
  /** The profile with the kept plan put back, or null when nothing is kept or there is no profile. */
  readonly profile: Profile | null;
}

/**
 * Turning the switch off puts back the plan kept from before the first tune-up change and
 * forgets it (R01.14). Locks are not part of the kept plan and stay as they are.
 */
export function turnOff(state: TuneUpState, profile: Profile | null): TurnOffResult {
  const restored =
    state.savedPlan !== null && profile !== null
      ? { ...profile, saved: { ...state.savedPlan } }
      : null;
  return { state: { ...state, on: false, savedPlan: null }, profile: restored };
}

/** Input switches that change what the plan is built from (none in v1), by name. */
export type InputSwitches = Readonly<Record<string, boolean>>;

/** What a run read before it called the AI. */
export interface RunStart {
  readonly profile: Profile;
  readonly switches: InputSwitches;
}

/** What is stored when the run checks again. */
export interface RunNow {
  readonly state: TuneUpState;
  readonly profile: Profile | null;
  readonly switches: InputSwitches;
}

function sameSwitches(a: InputSwitches, b: InputSwitches): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const name of names) {
    if (a[name] !== b[name]) return false;
  }
  return true;
}

/**
 * True while the run is still wanted: the switch is on and no input switch changed since the run
 * started. Checked after the evidence is gathered and before the AI call; when false the run ends
 * silently.
 */
export function stillWanted(start: RunStart, now: RunNow): boolean {
  return now.state.on && sameSwitches(start.switches, now.switches);
}

/** The AI's answer: a validated plan, or a failure of any kind. */
export type RunReply = { readonly ok: true; readonly targets: Targets } | { readonly ok: false };

export type Settlement =
  /** The switch went off or an input switch changed: nothing applied, nothing marked. */
  | { readonly kind: 'abandoned' }
  /** The call failed: the plan stays and today is marked as checked. */
  | { readonly kind: 'failed'; readonly state: TuneUpState }
  /** The profile changed while the call ran: the reply is dropped and nothing is marked. */
  | { readonly kind: 'dropped' }
  /** The new plan is applied with every lock cleared and today is marked as checked. */
  | { readonly kind: 'applied'; readonly state: TuneUpState; readonly profile: Profile };

/**
 * What a reply does once it arrives. A failure still marks today, so a broken key is not called
 * on every open (R01.5). A success is dropped when any profile field changed during the call
 * (R01.4). Otherwise the current saved targets are kept as the plan to restore, only if none is
 * kept yet (R01.14), and all four targets are applied with the locks cleared.
 */
export function settle(start: RunStart, now: RunNow, reply: RunReply, today: DayKey): Settlement {
  if (!stillWanted(start, now)) return { kind: 'abandoned' };
  if (!reply.ok) return { kind: 'failed', state: markedOn(now.state, today) };
  const latest = now.profile;
  if (latest === null || !sameProfile(latest, start.profile)) return { kind: 'dropped' };
  const { kcal, protein, carbs, fat } = reply.targets;
  return {
    kind: 'applied',
    state: {
      ...markedOn(now.state, today),
      savedPlan: now.state.savedPlan ?? { ...latest.saved },
    },
    profile: { ...withoutLocks(latest), saved: { kcal, protein, carbs, fat } },
  };
}

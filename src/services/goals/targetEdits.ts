// The Goals page's writes (P05-11, P05-12): target edits through the lock engine (P01-13), each
// read and written in the profile's one transaction, so an edit always starts from the stored
// plan; "Reset to auto" for a locked value; the silent first rebuild baseline behind the "inputs
// changed" nudge (P01-15); the weekly tune-up switch, which hands over to the tune-up runner and
// returns what it did; the goal-reached alert switch; and the optional nutrient goals (P01-07),
// clamped but never snapped. While the tune-up is on it owns the targets, so edits are refused
// here too, not only on the page (01 §3.7).

import { dayKeyOf } from '../../domain/dates/dayKey';
import { formulaPlan } from '../../domain/goals/formulas';
import { resetKcal, resetMacro, setKcal, setMacro } from '../../domain/goals/locks';
import type { PlanField } from '../../domain/goals/planEdit';
import type { Profile, Targets } from '../../domain/model';
import type { GoalKey } from '../../domain/nutrients/catalogue';
import { withGoalValue } from '../../domain/nutrients/goalDefaults';
import { baselineToSeed } from '../../domain/profile/signature';
import type { Clock } from '../../lib/clock';
import { ProfileUnavailableError, type ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { TuneUpOutcome, TuneUpRunner } from './tuneUp';

export type TargetEditOutcome =
  /** The edit is stored: all four values saved, locks as the engine left them. */
  | { readonly kind: 'saved' }
  /** Energy is locked and no other macro is free to give or take energy; nothing changed. */
  | { readonly kind: 'refused' }
  /** The weekly tune-up is on and owns the targets; nothing changed. */
  | { readonly kind: 'tuneUpOn' }
  /** No readable profile is stored; nothing changed. */
  | { readonly kind: 'noProfile' };

export type TuneUpSwitchOutcome =
  /** The switch is on and the forced run is over; `run` is what it did. */
  | { readonly kind: 'on'; readonly run: TuneUpOutcome }
  /** The switch is off; `restored` when the plan from before the tune-up was put back. */
  | { readonly kind: 'off'; readonly restored: boolean };

export interface TargetEditsService {
  /** Sets energy (in kcal) or a macro (in grams) and locks it, as the lock engine rules. */
  setTarget(field: PlanField, value: number): Promise<TargetEditOutcome>;
  /** Unlocks the value and gives it back to the automatic balance. */
  resetToAuto(field: PlanField): Promise<TargetEditOutcome>;
  /** Stores the current plan-input key as the rebuild baseline when no usable one is stored. */
  seedRebuildBaseline(): Promise<void>;
  /** Turns the weekly tune-up on (clears locks, forces a run) or off (puts the plan back). */
  setTuneUp(on: boolean): Promise<TuneUpSwitchOutcome>;
  setGoalReachedAlert(on: boolean): Promise<void>;
  /** Stores one optional nutrient goal, clamped to 0–999 999 and kept off the wheel's grid. */
  setNutrientGoal(key: GoalKey, value: number): Promise<void>;
}

export interface TargetEditsDeps {
  readonly profileRepo: Pick<ProfileRepo, 'get' | 'update'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'set' | 'update'>;
  readonly tuneUp: Pick<TuneUpRunner, 'turnOn' | 'turnOff'>;
  /** Today's formula plan stands in for the values nobody saved. */
  readonly clock: Clock;
}

const SAVED = { kind: 'saved' } as const;
const REFUSED = { kind: 'refused' } as const;
const TUNE_UP_ON = { kind: 'tuneUpOn' } as const;
const NO_PROFILE = { kind: 'noProfile' } as const;

/** Thrown inside the profile transaction to leave it unwritten. */
class EditRefused extends Error {
  override readonly name = 'EditRefused';
}

/** An engine step over the stored profile and its formula plan; null refuses the edit. */
type EngineStep = (profile: Profile, formula: Targets) => Profile | null;

export function createTargetEditsService(deps: TargetEditsDeps): TargetEditsService {
  const { profileRepo, settingsRepo, tuneUp, clock } = deps;

  async function apply(step: EngineStep): Promise<TargetEditOutcome> {
    if (await settingsRepo.get('tuneUp.on')) return TUNE_UP_ON;
    const today = dayKeyOf(clock.now());
    try {
      await profileRepo.update((current) => {
        const next = step(current, formulaPlan(current, today));
        if (next === null) throw new EditRefused();
        return next;
      });
      return SAVED;
    } catch (error) {
      if (error instanceof EditRefused) return REFUSED;
      if (error instanceof ProfileUnavailableError) return NO_PROFILE;
      throw error;
    }
  }

  return {
    setTarget(field, value) {
      return apply((profile, formula) =>
        field === 'kcal'
          ? setKcal(profile, formula, value)
          : setMacro(profile, formula, field, value),
      );
    },

    resetToAuto(field) {
      return apply((profile, formula) =>
        field === 'kcal' ? resetKcal(profile, formula) : resetMacro(profile, formula, field),
      );
    },

    async seedRebuildBaseline() {
      const read = await profileRepo.get();
      if (read.kind !== 'ok') return;
      const profile = read.value;
      if (baselineToSeed(profile, await settingsRepo.get('goals.rebuildBaseline')) === null) {
        return;
      }
      // Checked again inside the write, so a rebuild's baseline stored meanwhile stays.
      await settingsRepo.update(
        'goals.rebuildBaseline',
        (stored) => baselineToSeed(profile, stored) ?? stored,
      );
    },

    async setTuneUp(on) {
      if (on) return { kind: 'on', run: await tuneUp.turnOn() };
      const { restored } = await tuneUp.turnOff();
      return { kind: 'off', restored };
    },

    async setGoalReachedAlert(on) {
      await settingsRepo.set('alerts.goalReached', on);
    },

    async setNutrientGoal(key, value) {
      await settingsRepo.update('goals.nutrients', (goals) => withGoalValue(goals, key, value));
    },
  };
}

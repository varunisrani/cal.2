// Settings › Personal info (P05-10): every write the page makes. Profile fields change in one
// profile transaction each, through the domain's edit rules, and never touch the saved targets or
// the locks (R01.12): an edit to a plan input only makes the Goals page's rebuild nudge appear.
// A new weight is a weigh-in through the weight repository, which moves the profile weight and
// posts goal-reached itself. The height unit is a setting of its own; weight is kg only (D-16.91).

import type { DayKey } from '../domain/dates/dayKey';
import type { Activity, GoalKind, Profile, Sex } from '../domain/model';
import {
  checkGoalWeight,
  PACE_PRESETS,
  withBodyFat,
  withGoal,
  withGoalBodyFat,
  withWeight,
  type GoalWeightProblem,
  type PaceId,
} from '../domain/profile/editRules';
import { baselineToSeed } from '../domain/profile/signature';
import { weightShown, type HeightDisplayUnit, type WeightDisplayUnit } from '../domain/units/body';
import type { AddedWeighIn, WeightRepo } from '../data/repos/weightRepo';
import { ProfileUnavailableError, type ProfileRepo } from '../data/repos/profileRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { Clock } from '../lib/clock';
import { err, ok, type Result } from '../lib/result';

/** A saved weight: the weigh-in, whether it reached the goal, and whether the target went. */
export interface SavedWeight extends AddedWeighIn {
  /** The goal weight was dropped because the new weight contradicts it. */
  readonly targetDropped: boolean;
}

/** What adding an allergen did: added, or nothing because the name was empty or already there. */
export type AllergenAdd =
  | { readonly kind: 'added'; readonly allergens: readonly string[] }
  | { readonly kind: 'empty' | 'duplicate' };

export interface ProfileEditsService {
  setSex(sex: Sex): Promise<Profile>;
  setBirthDate(date: DayKey): Promise<Profile>;
  /** Height in cm, unrounded (a feet and inches pick stores its exact cm). */
  setHeight(cm: number): Promise<Profile>;
  /**
   * Adds one weigh-in stamped now; the weight repository moves the profile weight to it and posts
   * goal-reached when it crosses the goal. Then drops a goal weight the new weight contradicts.
   */
  saveWeight(kg: number): Promise<SavedWeight>;
  /** A body-fat fraction, or null to remove it together with goal body fat. */
  setBodyFat(fraction: number | null): Promise<Profile>;
  /** A goal body-fat fraction, or null to remove it; stored only while body fat is set. */
  setGoalBodyFat(fraction: number | null): Promise<Profile>;
  setActivity(activity: Activity): Promise<Profile>;
  /** Maintain drops pace and goal weight; lose and gain keep or start a pace (`withGoal`). */
  setGoal(goal: GoalKind): Promise<Profile>;
  /** The pace of a lose or gain goal. Throws a TypeError while the goal is maintain. */
  setPace(pace: PaceId): Promise<Profile>;
  /**
   * Stores a goal weight, or refuses one on the wrong side of the current weight and stores
   * nothing (D-16.11). The two weights are compared as the person reads them in `unit`, to the
   * tenth, as the wizard does (D-16.80). Throws a TypeError while the goal is maintain.
   */
  setGoalWeight(kg: number, unit: WeightDisplayUnit): Promise<Result<Profile, GoalWeightProblem>>;
  /** Adds a name to the allergen list, trimmed; an empty name or one already listed adds nothing. */
  addAllergen(name: string): Promise<AllergenAdd>;
  /** Takes that exact entry out of the allergen list. */
  removeAllergen(name: string): Promise<Profile>;
  setHeightUnit(unit: HeightDisplayUnit): Promise<void>;
}

export interface ProfileEditsDeps {
  readonly profileRepo: Pick<ProfileRepo, 'get' | 'update'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'set' | 'update'>;
  readonly weightRepo: Pick<WeightRepo, 'addWeighIn'>;
  /** Stamps the weigh-in a weight save adds. */
  readonly clock: Clock;
}

/**
 * Why a goal weight cannot be kept, comparing the two weights as they read in `unit` (to the
 * tenth): a target that reads the same as the current weight is refused for lose and gain.
 */
export function goalWeightProblem(
  profile: Pick<Profile, 'goal' | 'weightKg'>,
  goalKg: number,
  unit: WeightDisplayUnit,
): GoalWeightProblem | null {
  return checkGoalWeight(
    { goal: profile.goal, weightKg: weightShown(profile.weightKg, unit) },
    weightShown(goalKg, unit),
  );
}

/** An allergen name as stored: trimmed, inner runs of white space made one space. */
export function allergenName(typed: string): string {
  return typed.trim().replace(/\s+/gu, ' ');
}

/** Thrown inside a profile transaction to leave the stored profile as it is. */
class Refusal<E> extends Error {
  override readonly name = 'Refusal';
  readonly problem: E;

  constructor(problem: E) {
    super('Refused: the profile is left as it is');
    this.problem = problem;
  }
}

function checkPositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`A ${what} needs a number above 0, got ${value}`);
  }
}

function checkFraction(value: number | null, what: string): void {
  if (value !== null && (!Number.isFinite(value) || value <= 0 || value >= 1)) {
    throw new RangeError(`A ${what} is a fraction between 0 and 1, got ${value}`);
  }
}

function needsLoseOrGain(profile: Profile, what: string): void {
  if (profile.goal === 'maintain') throw new TypeError(`Maintaining a weight has no ${what}`);
}

export function createProfileEditsService(deps: ProfileEditsDeps): ProfileEditsService {
  const { profileRepo, settingsRepo, weightRepo, clock } = deps;

  // The rebuild nudge compares the plan inputs with a stored baseline. When none is stored yet
  // (the Goals page has not been opened), store the inputs as they are before this edit, so the
  // edit raises the nudge instead of becoming the baseline the Goals page seeds on first open.
  async function seedBaseline(): Promise<void> {
    const read = await profileRepo.get();
    if (read.kind !== 'ok') return;
    const before = read.value;
    if (baselineToSeed(before, await settingsRepo.get('goals.rebuildBaseline')) === null) return;
    await settingsRepo.update(
      'goals.rebuildBaseline',
      (stored) => baselineToSeed(before, stored) ?? stored,
    );
  }

  async function edit(change: (current: Profile) => Profile): Promise<Profile> {
    await seedBaseline();
    return profileRepo.update(change);
  }

  /** One profile update, where `change` may throw a `Refusal` to store nothing instead. */
  async function updateOrRefuse<E>(
    change: (current: Profile) => Profile,
  ): Promise<Result<Profile, E>> {
    try {
      return ok(await profileRepo.update(change));
    } catch (error) {
      if (error instanceof Refusal) return err(error.problem as E);
      throw error;
    }
  }

  async function editOrRefuse<E>(
    change: (current: Profile) => Profile,
  ): Promise<Result<Profile, E>> {
    await seedBaseline();
    return updateOrRefuse<E>(change);
  }

  return {
    setSex: (sex) => edit((current) => ({ ...current, sex })),

    setBirthDate: (birthDate) => edit((current) => ({ ...current, birthDate })),

    async setHeight(cm) {
      checkPositive(cm, 'height');
      return edit((current) => ({ ...current, heightCm: cm }));
    },

    async saveWeight(kg) {
      checkPositive(kg, 'weight');
      await seedBaseline();
      const added = await weightRepo.addWeighIn({ at: clock.now(), kg });
      // The new weight (not the profile weight, which a later-dated reading may hold) decides
      // whether the goal weight still points the right way.
      const result = await updateOrRefuse<'kept'>((current) => {
        const checked = withWeight(current, kg);
        if (current.goalWeightKg === undefined || checked.goalWeightKg !== undefined) {
          throw new Refusal('kept');
        }
        return { ...checked, weightKg: current.weightKg };
      }).catch((error: unknown) => {
        // No readable profile: the weigh-in is stored and there is no goal weight to drop.
        if (error instanceof ProfileUnavailableError) return err('kept' as const);
        throw error;
      });
      return { ...added, targetDropped: result.ok };
    },

    async setBodyFat(fraction) {
      checkFraction(fraction, 'body fat');
      return edit((current) => withBodyFat(current, fraction));
    },

    async setGoalBodyFat(fraction) {
      checkFraction(fraction, 'goal body fat');
      return edit((current) => withGoalBodyFat(current, fraction));
    },

    setActivity: (activity) => edit((current) => ({ ...current, activity })),

    setGoal: (goal) => edit((current) => withGoal(current, goal)),

    setPace: (pace) =>
      edit((current) => {
        needsLoseOrGain(current, 'pace');
        return { ...current, weeklyKg: PACE_PRESETS[pace] };
      }),

    async setGoalWeight(kg, unit) {
      checkPositive(kg, 'goal weight');
      return editOrRefuse<GoalWeightProblem>((current) => {
        needsLoseOrGain(current, 'goal weight');
        const problem = goalWeightProblem(current, kg, unit);
        if (problem !== null) throw new Refusal(problem);
        return { ...current, goalWeightKg: kg };
      });
    },

    async addAllergen(typed) {
      const name = allergenName(typed);
      if (name === '') return { kind: 'empty' };
      const key = name.toLocaleLowerCase();
      const result = await editOrRefuse<'duplicate'>((current) => {
        if (current.allergens.some((listed) => listed.toLocaleLowerCase() === key)) {
          throw new Refusal('duplicate');
        }
        return { ...current, allergens: [...current.allergens, name] };
      });
      return result.ok
        ? { kind: 'added', allergens: result.value.allergens }
        : { kind: result.error };
    },

    removeAllergen: (name) =>
      edit((current) => ({
        ...current,
        allergens: current.allergens.filter((listed) => listed !== name),
      })),

    async setHeightUnit(unit) {
      await settingsRepo.set('units.height', unit);
    },
  };
}

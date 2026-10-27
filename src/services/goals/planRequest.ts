// What a rebuild (P05-08) and the weekly tune-up (P05-09) share: the inputs of a plan request read
// from storage, the request itself, and writing a new plan only over the profile it was built
// from (R01.4). The AI client gives each request its own deadline from the person's timeout
// setting (D-16.23). Failures of the AI are values; storage failures reject.

import type { CheckedPlan } from '../../domain/goals/planValidator';
import type { InputSwitches, TuneUpState } from '../../domain/adaptive/cadence';
import { dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import { buildEvidence, completedWindow } from '../../domain/forecast/evidence';
import type { Profile, Targets } from '../../domain/model';
import { sameProfile } from '../../domain/profile/profile';
import type { AiDeps } from '../../ai/client';
import type { AiFailure } from '../../ai/errors';
import type { PlanPromptInput } from '../../ai/prompts/plan';
import type { DisplayUnits } from '../../ai/prompts/shared';
import type { AiSettings, ProviderKeys } from '../../ai/settings';
import type { Clock } from '../../lib/clock';
import type { Result } from '../../lib/result';
import type { BodyFatRepo } from '../../data/repos/bodyFatRepo';
import type { DiaryRepo } from '../../data/repos/diaryRepo';
import { ProfileUnavailableError, type ProfileRepo } from '../../data/repos/profileRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { WeightRepo } from '../../data/repos/weightRepo';

/** The stored AI setup: the `ai.settings` row and the keys from the secrets store. */
export interface AiAccess {
  readonly settings: AiSettings;
  readonly keys: ProviderKeys;
}

/** What the goals services read and write through. */
export interface PlanServiceDeps {
  readonly profileRepo: Pick<ProfileRepo, 'get' | 'update'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'set' | 'update'>;
  readonly weightRepo: Pick<WeightRepo, 'between'>;
  readonly bodyFatRepo: Pick<BodyFatRepo, 'between'>;
  readonly diaryRepo: Pick<DiaryRepo, 'between'>;
  readonly clock: Clock;
  /** Read once per request, so a key saved a moment ago is used. */
  readonly aiAccess: () => Promise<AiAccess>;
  /** Handed to the AI client; services never use the global one. */
  readonly fetch: typeof fetch;
  /**
   * Switches that change what a plan is built from, by name. None exist in v1 (Energy Burn is a
   * later phase), so this defaults to none; a result is dropped when one changed meanwhile.
   */
  readonly inputSwitches?: () => Promise<InputSwitches>;
}

const NO_SWITCHES: InputSwitches = Object.freeze({});

/** Today's local day. */
export function todayOf(deps: Pick<PlanServiceDeps, 'clock'>): DayKey {
  return dayKeyOf(deps.clock.now());
}

/** The input switches as they are now; none when the deps name none. */
export function readSwitches(deps: Pick<PlanServiceDeps, 'inputSwitches'>): Promise<InputSwitches> {
  return deps.inputSwitches?.() ?? Promise.resolve(NO_SWITCHES);
}

/** True when both maps hold the same switches with the same values. */
export function sameSwitches(a: InputSwitches, b: InputSwitches): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...names].every((name) => a[name] === b[name]);
}

/** The stored tune-up settings, as the reducer reads them. */
export async function readTuneUpState(
  deps: Pick<PlanServiceDeps, 'settingsRepo'>,
): Promise<TuneUpState> {
  const { settingsRepo } = deps;
  const [on, lastCheckDay, savedPlan] = await Promise.all([
    settingsRepo.get('tuneUp.on'),
    settingsRepo.get('tuneUp.lastCheckDay'),
    settingsRepo.get('tuneUp.savedPlan'),
  ]);
  return { on, lastCheckDay, savedPlan };
}

/** The display units the prompt mentions next to the canonical values. */
export async function readUnits(
  deps: Pick<PlanServiceDeps, 'settingsRepo'>,
): Promise<DisplayUnits> {
  const { settingsRepo } = deps;
  const [energy, weight, height] = await Promise.all([
    settingsRepo.get('units.energy'),
    settingsRepo.get('units.weight'),
    settingsRepo.get('units.height'),
  ]);
  return { energy, weight, height };
}

/**
 * The plan request for `profile` on `today`: the display units and the evidence pack over the
 * finished days of the window (weigh-ins and body fat through today; the pack leaves today's food
 * out itself).
 */
export async function preparePlanRequest(
  deps: PlanServiceDeps,
  profile: Profile,
  today: DayKey,
): Promise<PlanPromptInput> {
  const window = completedWindow(today);
  const [units, entries, weighIns, bodyFat] = await Promise.all([
    readUnits(deps),
    deps.diaryRepo.between(window.first, window.last),
    deps.weightRepo.between(window.first, today),
    deps.bodyFatRepo.between(window.first, today),
  ]);
  const evidence = buildEvidence({ profile, entries, weighIns, bodyFat, today });
  return { profile, today, units, evidence };
}

/** The AI client's deps for one request: the stored setup and the injected fetch. */
export async function aiDepsOf(deps: PlanServiceDeps): Promise<AiDeps> {
  const { settings, keys } = await deps.aiAccess();
  return { settings, keys, fetch: deps.fetch };
}

/** Sends the plan request; the reply is already checked against the formula plan (R01.2). */
export async function sendPlanRequest(
  deps: PlanServiceDeps,
  input: PlanPromptInput,
): Promise<Result<CheckedPlan, AiFailure>> {
  // The AI layer is fetched on first use (P10-08's budget).
  const { requestPlan } = await import('../../ai/tasks/planning');
  return requestPlan(input, await aiDepsOf(deps));
}

/** `profile` with all four targets from `plan` and every lock cleared (01 §3.6 Applying). */
export function withPlan(profile: Profile, plan: Targets): Profile {
  const { kcal, protein, carbs, fat } = plan;
  return {
    ...profile,
    saved: { kcal, protein, carbs, fat },
    caloriesLocked: false,
    lockedMacros: [],
  };
}

/** Thrown inside the profile transaction to leave it unwritten. */
class ProfileMoved extends Error {
  override readonly name = 'ProfileMoved';
}

/**
 * Stores `next` only when the stored profile still equals `expected` in every field, checked and
 * written in the profile repository's one transaction, so an edit made at the last moment still
 * wins (R01.4). False when the profile changed, or is missing or unreadable.
 */
export async function replaceIfUnchanged(
  deps: Pick<PlanServiceDeps, 'profileRepo'>,
  expected: Profile,
  next: Profile,
): Promise<boolean> {
  try {
    await deps.profileRepo.update((current) => {
      if (!sameProfile(current, expected)) throw new ProfileMoved();
      return next;
    });
    return true;
  } catch (error) {
    if (error instanceof ProfileMoved || error instanceof ProfileUnavailableError) return false;
    throw error;
  }
}

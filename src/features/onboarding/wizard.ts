// The onboarding wizard as a pure state machine: thirteen steps from Welcome to Plan ready
// (D-16.63), the answers kept in storage units (cm, kg, body fat as a fraction) and converted only
// where a screen shows them, so switching metric and imperial never changes an entered value
// (R01.3). Continue and Back follow per-step rules, and every visit to Building plan gets its own
// run number so a plan that arrives after the person left is dropped (R01.8). Screens dispatch
// actions; nothing here reads a clock, the browser or storage.

import { isDayKey, type DayKey } from '../../domain/dates/dayKey';
import { birthDateYearsBefore, profileDefaults } from '../../domain/profile/profile';
import {
  checkGoalWeight,
  PACE_PRESETS,
  type GoalWeightProblem,
  type PaceId,
} from '../../domain/profile/editRules';
import { editPlan, type PlanDraft, type PlanField } from '../../domain/goals/planEdit';
import type { Activity, GoalKind, Profile, Sex, Targets } from '../../domain/model';
import {
  cmFromFeetInches,
  HEIGHT_WHEEL,
  WEIGHT_WHEEL,
  weightFromDisplay,
  weightShown,
  weightToDisplay,
  CM_PER_INCH,
  type HeightDisplayUnit,
  type WeightDisplayUnit,
} from '../../domain/units/body';
import { clamp, type WheelRange } from '../../domain/units/numbers';

// ---- Steps ----------------------------------------------------------------------------------

/** The steps in order; a step's position is its index (0 Welcome … 12 Plan ready). */
export const WIZARD_STEPS = [
  'welcome',
  'sex',
  'birthday',
  'body',
  'bodyFat',
  'activity',
  'goal',
  'target',
  'pace',
  'reminders',
  'aiAccess',
  'buildingPlan',
  'planReady',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** The index of the last step; progress is a step's index over this. */
export const LAST_STEP_INDEX = WIZARD_STEPS.length - 1;

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

// ---- Answers --------------------------------------------------------------------------------

/** How a person reads height and weight while the wizard runs; Settings stores both. */
export interface WizardUnits {
  readonly height: HeightDisplayUnit;
  readonly weight: WeightDisplayUnit;
}

/** The one Metric | Imperial toggle of the Body step, which sets both units together. */
export type UnitSystem = 'metric' | 'imperial';

const UNITS_OF: Readonly<Record<UnitSystem, WizardUnits>> = {
  metric: { height: 'cm', weight: 'kg' },
  imperial: { height: 'ftIn', weight: 'lb' },
};

/** Metric only when both units are metric; any imperial unit reads as imperial. */
export function unitSystemOf(units: WizardUnits): UnitSystem {
  return units.height === 'cm' && units.weight === 'kg' ? 'metric' : 'imperial';
}

/** Every body-fat wheel, in percent (Proposed D-16.56). */
export const BODY_FAT_WHEEL: WheelRange = { min: 3, max: 60, step: 0.5 };

/** Body fat a person who says they know it starts from. */
export const DEFAULT_BODY_FAT = 0.2;

/** Kilograms between the current weight and the target a lose or gain goal starts from. */
export const TARGET_SEED_KG = 5;

/** The oldest birth date the wizard accepts, in years before today. */
export const OLDEST_AGE_YEARS = 120;

/** What came of asking for notification permission. Only `granted` turns reminders on. */
export type ReminderAnswer = 'granted' | 'denied' | 'dismissed' | 'unsupported';

/** What the browser says when asked; `unsupported` when it cannot show notifications at all. */
export type PermissionReply = NotificationPermission | 'unsupported';

/** Asks the browser for notification permission (P05-07 passes the real one). */
export type AskNotifications = () => Promise<PermissionReply>;

/** The answer a permission reply records: a prompt closed without a choice is `dismissed`. */
export function reminderAnswerOf(reply: PermissionReply): ReminderAnswer {
  return reply === 'default' ? 'dismissed' : reply;
}

/** The plan Building plan hands to Plan ready (P05-05 builds it, P05-06 edits it). */
export interface WizardPlan {
  readonly draft: PlanDraft;
  /** The formulas stood in because the AI could not give a plan (D-16.14). */
  readonly aiUnavailable: boolean;
}

export interface WizardState {
  readonly step: WizardStep;
  /** The local day the wizard runs on: the birthday default and its latest allowed value. */
  readonly today: DayKey;
  readonly units: WizardUnits;
  readonly sex: Sex;
  readonly birthDate: DayKey;
  readonly heightCm: number;
  readonly weightKg: number;
  /** Fraction, or null when the person does not know it. */
  readonly bodyFat: number | null;
  /** Fraction, or null when no goal is set; never set without `bodyFat`. */
  readonly goalBodyFat: number | null;
  readonly activity: Activity;
  readonly goal: GoalKind;
  readonly targetKg: number;
  /** The person picked the target themselves, so a new current weight no longer re-seeds it. */
  readonly targetMoved: boolean;
  readonly pace: PaceId;
  /** The notification answer, or null when the person has not asked. */
  readonly reminders: ReminderAnswer | null;
  /** The AI access step reports that its setup lets the person go on (P05-04). */
  readonly aiReady: boolean;
  /** Counts visits to Building plan; a plan is accepted only for the current one. */
  readonly buildRun: number;
  readonly plan: WizardPlan | null;
  /** Plan ready's last button was pressed: onboarding completes from here (P05-07). */
  readonly finished: boolean;
}

/**
 * The value `kg` takes on a weight wheel in `unit`: unchanged when the wheel can show it (to the
 * tenth), otherwise the wheel's nearest end.
 */
function holdWeight(kg: number, unit: WeightDisplayUnit): number {
  const { min, max } = WEIGHT_WHEEL[unit];
  const tenths = Math.round(weightToDisplay(kg, unit) * 10);
  if (tenths < min * 10) return weightFromDisplay(min, unit);
  if (tenths > max * 10) return weightFromDisplay(max, unit);
  return kg;
}

/** The value `cm` takes on a height wheel in `unit`, by the same rule as `holdWeight`. */
function holdHeight(cm: number, unit: HeightDisplayUnit): number {
  if (unit === 'cm') {
    const { min, max } = HEIGHT_WHEEL.cm;
    const shown = Math.round(cm);
    return shown < min ? min : shown > max ? max : cm;
  }
  const { min, max } = HEIGHT_WHEEL.inches;
  const inches = Math.round(cm / CM_PER_INCH);
  if (inches < min) return cmFromFeetInches(0, min);
  if (inches > max) return cmFromFeetInches(0, max);
  return cm;
}

/** The target a goal starts from: 5 kg under or over the current weight, held to the wheel. */
function seedTarget(goal: GoalKind, weightKg: number, unit: WeightDisplayUnit): number {
  const offset = goal === 'lose' ? -TARGET_SEED_KG : goal === 'gain' ? TARGET_SEED_KG : 0;
  return holdWeight(weightKg + offset, unit);
}

/** The first state: the default profile for `today`, shown in `units`. */
export function startWizard(today: DayKey, units: WizardUnits): WizardState {
  const profile = profileDefaults(today);
  return {
    step: 'welcome',
    today,
    units,
    sex: profile.sex,
    birthDate: profile.birthDate,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    bodyFat: null,
    goalBodyFat: null,
    activity: profile.activity,
    goal: profile.goal,
    targetKg: seedTarget(profile.goal, profile.weightKg, units.weight),
    targetMoved: false,
    pace: 'steady',
    reminders: null,
    aiReady: false,
    buildRun: 0,
    plan: null,
    finished: false,
  };
}

// ---- Rules ----------------------------------------------------------------------------------

/**
 * Why the target cannot be kept, or null. Lose needs a target below the current weight and gain
 * one above it (D-16.11, R01.6); maintain has no check. The two weights are compared as the
 * person reads them (to the tenth, in their unit), so a target that reads the same as the current
 * weight is refused.
 */
export function targetProblem(state: WizardState): GoalWeightProblem | null {
  if (state.goal === 'maintain') return null;
  const unit = state.units.weight;
  return checkGoalWeight(
    { goal: state.goal, weightKg: weightShown(state.weightKg, unit) },
    weightShown(state.targetKg, unit),
  );
}

/** True when the footer's Continue may move on from the current step. */
export function canContinue(state: WizardState): boolean {
  switch (state.step) {
    case 'target':
      return targetProblem(state) === null;
    case 'aiAccess':
      return state.aiReady;
    // Building plan moves on by itself; Plan ready finishes through its own button (P05-06).
    case 'buildingPlan':
    case 'planReady':
      return false;
    default:
      return true;
  }
}

/** Back does nothing on Welcome and while the plan is being built. */
export function canGoBack(state: WizardState): boolean {
  return state.step !== 'welcome' && state.step !== 'buildingPlan';
}

/** The progress bar's share, index ÷ 12, on steps 1–10; null where no bar is shown. */
export function progressOf(state: WizardState): number | null {
  const index = stepIndex(state.step);
  return index >= 1 && index <= stepIndex('aiAccess') ? index / LAST_STEP_INDEX : null;
}

/** Weekly kilograms of the chosen pace. */
export function weeklyKgOf(state: WizardState): number {
  return PACE_PRESETS[state.pace];
}

/**
 * Whole days to the target at the chosen pace: trunc(|target − current| ÷ weekly × 7), from the
 * stored kilograms. Null for maintain.
 */
export function estimatedDays(state: WizardState): number | null {
  if (state.goal === 'maintain') return null;
  return Math.trunc((Math.abs(state.targetKg - state.weightKg) / weeklyKgOf(state)) * 7);
}

/** Reminders are on only after the browser granted permission (D-16.15). */
export function remindersOn(state: WizardState): boolean {
  return state.reminders === 'granted';
}

/** A body-fat fraction as the wheel shows it: percent on the 0.5 grid, inside 3–60. */
export function bodyFatPercent(fraction: number): number {
  const { min, max, step } = BODY_FAT_WHEEL;
  return clamp(Math.round((fraction * 100) / step) * step, min, max);
}

/** A picked percent as the fraction to store, held to 3–60 %. */
function bodyFatFraction(percent: number): number {
  return clamp(percent, BODY_FAT_WHEEL.min, BODY_FAT_WHEEL.max) / 100;
}

/**
 * The profile the answers make: maintain has no pace and no target weight, goal body fat exists
 * only next to body fat, and the plan (when one was built) becomes the saved targets.
 */
export function wizardProfile(state: WizardState): Profile {
  const profile: Profile = {
    sex: state.sex,
    birthDate: state.birthDate,
    heightCm: state.heightCm,
    weightKg: state.weightKg,
    activity: state.activity,
    goal: state.goal,
    saved: state.plan === null ? {} : { ...state.plan.draft.plan },
    allergens: [],
    caloriesLocked: false,
    lockedMacros: [],
  };
  if (state.bodyFat !== null) {
    profile.bodyFat = state.bodyFat;
    if (state.goalBodyFat !== null) profile.goalBodyFat = state.goalBodyFat;
  }
  if (state.goal !== 'maintain') {
    profile.weeklyKg = weeklyKgOf(state);
    profile.goalWeightKg = state.targetKg;
  }
  return profile;
}

// ---- Actions --------------------------------------------------------------------------------

export type WizardAction =
  | { readonly type: 'next' }
  | { readonly type: 'back' }
  | { readonly type: 'sex'; readonly sex: Sex }
  | { readonly type: 'birthDate'; readonly date: DayKey }
  | { readonly type: 'units'; readonly system: UnitSystem }
  | { readonly type: 'height'; readonly cm: number }
  | { readonly type: 'weight'; readonly kg: number }
  | { readonly type: 'bodyFatKnown'; readonly known: boolean }
  | { readonly type: 'bodyFat'; readonly percent: number }
  | { readonly type: 'goalBodyFatOn'; readonly on: boolean }
  | { readonly type: 'goalBodyFat'; readonly percent: number }
  | { readonly type: 'activity'; readonly activity: Activity }
  | { readonly type: 'goal'; readonly goal: GoalKind }
  | { readonly type: 'target'; readonly kg: number }
  | { readonly type: 'pace'; readonly pace: PaceId }
  | { readonly type: 'remindersAnswered'; readonly answer: ReminderAnswer }
  | { readonly type: 'aiReady'; readonly ready: boolean }
  | {
      readonly type: 'planBuilt';
      readonly run: number;
      readonly plan: Targets;
      readonly aiUnavailable: boolean;
    }
  | { readonly type: 'planEdit'; readonly field: PlanField; readonly value: number }
  | { readonly type: 'finish' };

function moveOn(state: WizardState): WizardState {
  if (!canContinue(state)) return state;
  const step = WIZARD_STEPS[stepIndex(state.step) + 1];
  if (step === undefined) return state;
  // A new visit to Building plan is a new run; results of earlier runs no longer count.
  if (step === 'buildingPlan') return { ...state, step, buildRun: state.buildRun + 1 };
  return { ...state, step };
}

function goBack(state: WizardState): WizardState {
  if (!canGoBack(state)) return state;
  // Building plan would build the plan again over any edits, so Plan ready skips it.
  if (state.step === 'planReady') return { ...state, step: 'aiAccess' };
  const step = WIZARD_STEPS[stepIndex(state.step) - 1];
  return step === undefined ? state : { ...state, step };
}

function withUnits(state: WizardState, system: UnitSystem): WizardState {
  const units = UNITS_OF[system];
  if (units.height === state.units.height && units.weight === state.units.weight) return state;
  const weightKg = holdWeight(state.weightKg, units.weight);
  return {
    ...state,
    units,
    heightCm: holdHeight(state.heightCm, units.height),
    weightKg,
    targetKg: state.targetMoved
      ? holdWeight(state.targetKg, units.weight)
      : seedTarget(state.goal, weightKg, units.weight),
  };
}

function withWeight(state: WizardState, kg: number): WizardState {
  const weightKg = holdWeight(kg, state.units.weight);
  const targetKg = state.targetMoved
    ? state.targetKg
    : seedTarget(state.goal, weightKg, state.units.weight);
  return { ...state, weightKg, targetKg };
}

function withBirthDate(state: WizardState, date: DayKey): WizardState {
  if (!isDayKey(date)) return state;
  const oldest = birthDateYearsBefore(state.today, OLDEST_AGE_YEARS);
  const birthDate = date > state.today ? state.today : date < oldest ? oldest : date;
  return { ...state, birthDate };
}

function withPlan(
  state: WizardState,
  run: number,
  plan: Targets,
  aiUnavailable: boolean,
): WizardState {
  // Only the run Building plan is showing may finish it (R01.8).
  if (state.step !== 'buildingPlan' || run !== state.buildRun) return state;
  return { ...state, step: 'planReady', plan: { draft: { plan, touched: false }, aiUnavailable } };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'next':
      return moveOn(state);
    case 'back':
      return goBack(state);
    case 'sex':
      return { ...state, sex: action.sex };
    case 'birthDate':
      return withBirthDate(state, action.date);
    case 'units':
      return withUnits(state, action.system);
    case 'height':
      return { ...state, heightCm: holdHeight(action.cm, state.units.height) };
    case 'weight':
      return withWeight(state, action.kg);
    case 'bodyFatKnown':
      if (!action.known) return { ...state, bodyFat: null, goalBodyFat: null };
      return state.bodyFat === null ? { ...state, bodyFat: DEFAULT_BODY_FAT } : state;
    case 'bodyFat':
      return { ...state, bodyFat: bodyFatFraction(action.percent) };
    case 'goalBodyFatOn':
      if (!action.on || state.bodyFat === null) return { ...state, goalBodyFat: null };
      return state.goalBodyFat === null ? { ...state, goalBodyFat: state.bodyFat } : state;
    case 'goalBodyFat':
      if (state.bodyFat === null) return state;
      return { ...state, goalBodyFat: bodyFatFraction(action.percent) };
    case 'activity':
      return { ...state, activity: action.activity };
    case 'goal':
      if (action.goal === state.goal) return state;
      return {
        ...state,
        goal: action.goal,
        targetKg: seedTarget(action.goal, state.weightKg, state.units.weight),
        targetMoved: false,
      };
    case 'target':
      return { ...state, targetKg: holdWeight(action.kg, state.units.weight), targetMoved: true };
    case 'pace':
      return { ...state, pace: action.pace };
    case 'remindersAnswered':
      return { ...state, reminders: action.answer };
    case 'aiReady':
      return { ...state, aiReady: action.ready };
    case 'planBuilt':
      return withPlan(state, action.run, action.plan, action.aiUnavailable);
    case 'planEdit':
      if (state.step !== 'planReady' || state.plan === null) return state;
      return {
        ...state,
        plan: { ...state.plan, draft: editPlan(state.plan.draft, action.field, action.value) },
      };
    case 'finish':
      // Only Plan ready with a plan can finish, and only once.
      if (state.step !== 'planReady' || state.plan === null || state.finished) return state;
      return { ...state, finished: true };
  }
}

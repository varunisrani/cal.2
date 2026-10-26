/**
 * What several prompts share: the shape every prompt builder returns, the kJ line for people who
 * read energy in kilojoules (01 §3.2), the nutrient unit list (03 §3.5), the compact re-ask note
 * (03 §3.8) and the profile facts the planning prompts carry. Numbers in prompts are written with
 * a dot and no grouping, so a model never reads "1,024" as two numbers.
 */
import { ageOn } from '../../domain/dates/age';
import type { DayKey } from '../../domain/dates/dayKey';
import { DEFAULT_WEEKLY_KG } from '../../domain/goals/formulas';
import {
  EXTRA_UNIT,
  MASS_UNITS,
  NUTRIENT_UNITS,
  type MassUnit,
} from '../../domain/nutrients/catalogue';
import {
  EXTRA_KEYS,
  NUTRIENT_KEYS,
  type Activity,
  type GoalKind,
  type Profile,
} from '../../domain/model';
import {
  feetInches,
  formatPace,
  weightShown,
  type HeightDisplayUnit,
  type WeightDisplayUnit,
} from '../../domain/units/body';
import { KJ_PER_KCAL, type EnergyDisplayUnit } from '../../domain/units/energy';
import { plainText } from '../../domain/units/numbers';

/** One request's text. */
export interface PromptText {
  /** Who the model is and how it answers. The client adds the person's notes for the AI (D-16.24). */
  readonly system: string;
  /** The request itself: what is given and what to send back. */
  readonly prompt: string;
}

/** How the person reads energy, weight and height (settings `units.*`). */
export interface DisplayUnits {
  readonly energy: EnergyDisplayUnit;
  readonly weight: WeightDisplayUnit;
  readonly height: HeightDisplayUnit;
}

/** kcal and the three macros of a meal, a day or a target. */
export interface EnergyAndMacros {
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
}

// ---- Text helpers -------------------------------------------------------------------------

type Piece = string | undefined | false;

/** The pieces that hold text, one per line. */
export function lines(...pieces: readonly Piece[]): string {
  return pieces
    .filter((piece): piece is string => typeof piece === 'string' && piece !== '')
    .join('\n');
}

/** The pieces that hold text, separated by a blank line. */
export function paragraphs(...pieces: readonly Piece[]): string {
  return pieces
    .filter((piece): piece is string => typeof piece === 'string' && piece.trim() !== '')
    .join('\n\n');
}

/** Each item as a "- " line. */
export function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

/** Up to `digits` decimals with a dot, no grouping, trailing zeros dropped: 1673.75 → "1673.8". */
export function num(value: number, digits = 1): string {
  return plainText(value, digits);
}

/** A reply key as the model must write it: `"servingGrams"`. */
export function jsonKey(name: string): string {
  return `"${name}"`;
}

/** Exactly one decimal with a dot: 70 → "70.0", 154.32 → "154.3". */
export function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10 + 0).toFixed(1);
}

/** The person's own words on one line in double quotes; line breaks and runs of spaces become one space. */
export function quoted(text: string): string {
  return `"${text.replace(/\s+/g, ' ').trim()}"`;
}

/** Trimmed text, or undefined when there is none. */
export function textOrNone(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/** "kcal 2000, protein 150 g, carbs 215 g, fat 60 g": whole kcal, grams to one decimal. */
export function energyAndMacros(values: EnergyAndMacros): string {
  return (
    `${num(Math.round(values.kcal), 0)} kcal, protein ${num(values.protein)} g, ` +
    `carbs ${num(values.carbs)} g, fat ${num(values.fat)} g`
  );
}

// ---- Energy unit --------------------------------------------------------------------------

export interface KilojouleLineOptions {
  /** The reply has number fields (JSON) that must stay in kcal. */
  readonly replyFieldsInKcal?: boolean;
}

/**
 * The line a prompt gains when the person reads kJ: every figure we send is kcal, and amounts the
 * answer states to the person are converted at 4.184 and written whole. kcal readers get nothing,
 * so their prompts stay exactly as they are.
 */
export function kilojouleLine(
  unit: EnergyDisplayUnit,
  options: KilojouleLineOptions = {},
): string | undefined {
  if (unit !== 'kJ') return undefined;
  const fields = options.replyFieldsInKcal
    ? ' Number fields of the reply stay in kcal; only the words meant for the person use kJ.'
    : '';
  return (
    'The person reads energy in kilojoules. Every energy figure in this request is in kcal. ' +
    `When your answer tells them an amount of energy, give it in kJ (kcal × ${KJ_PER_KCAL}) as a ` +
    `whole number.${fields}`
  );
}

// ---- Nutrient units -------------------------------------------------------------------------

const UNIT_WORDS: Readonly<Record<MassUnit, string>> = {
  g: 'grams',
  mg: 'milligrams',
  mcg: 'micrograms',
};

/**
 * One line per storage unit naming every optional nutrient key stored in it, the sports compounds
 * with the grams. Built from the domain catalogue, so it always matches what the diary stores.
 */
export const NUTRIENT_UNIT_LIST = bullets(
  MASS_UNITS.map((unit) => {
    const keys: string[] = NUTRIENT_KEYS.filter((key) => NUTRIENT_UNITS[key] === unit);
    if (unit === EXTRA_UNIT) keys.push(...EXTRA_KEYS);
    return `${UNIT_WORDS[unit]} (${unit}): ${keys.join(', ')}`;
  }),
);

// ---- Compact re-ask -----------------------------------------------------------------------

/** What the cut-off request wanted back. */
export type ReplyForm = 'json' | 'prose';

/**
 * The note the client adds to a request whose answer was cut off (03 §3.8): the last answer was
 * incomplete, so send only the bare object (or a short plain reply) and stay under the token
 * budget, the person's answer limit.
 */
export function compactRetryNote(maxTokens: number, form: ReplyForm): string {
  const budget = Number.isFinite(maxTokens) && maxTokens >= 1 ? Math.floor(maxTokens) : 1;
  const opening = 'Your last answer was cut off before it was complete.';
  if (form === 'prose') {
    return (
      `${opening} Answer again in a few short plain sentences, without JSON or markdown, and ` +
      `keep the whole reply under ${budget} tokens.`
    );
  }
  return (
    `${opening} Send the JSON object again and nothing else: no reasoning written out, no ` +
    `remarks, no code fence. Keep the whole reply under ${budget} tokens.`
  );
}

// ---- Profile facts --------------------------------------------------------------------------

/** Our own short description of each activity level. */
const ACTIVITY_WORDS: Readonly<Record<Activity, string>> = {
  sedentary: 'sits most of the day, little planned exercise',
  light: 'mostly seated, light exercise 1 to 3 days a week',
  moderate: 'trains or plays sport 3 to 5 days a week',
  active: 'trains most days or works on their feet',
  hard: 'trains hard 6 to 7 days a week or does physical work',
  athlete: 'athlete-level training, twice a day or manual work plus training',
};

const GOAL_WORDS: Readonly<Record<GoalKind, string>> = {
  lose: 'lose weight',
  maintain: 'keep their weight',
  gain: 'gain weight',
};

/** A weight in kg to one decimal, with the person's reading in lb when they use lb. */
function weightText(kg: number, unit: WeightDisplayUnit): string {
  const shown = unit === 'lb' ? ` (they read ${oneDecimal(weightShown(kg, 'lb'))} lb)` : '';
  return `${oneDecimal(kg)} kg${shown}`;
}

function paceText(profile: Profile, unit: WeightDisplayUnit): string {
  if (profile.goal === 'maintain') return 'not set (keeping weight)';
  const kg = profile.weeklyKg ?? DEFAULT_WEEKLY_KG;
  const unset = profile.weeklyKg === undefined ? ', the default' : '';
  const shown = unit === 'lb' ? ` (they read ${formatPace(kg, 'lb')} lb a week)` : '';
  return `${formatPace(kg, 'kg')} kg a week${shown}${unset}`;
}

/**
 * The profile as "- " lines: canonical metric to one decimal, plus the person's own units where
 * they differ, body fat as a percent and a fraction, and "not set" for what is missing.
 */
export function profileFacts(profile: Profile, today: DayKey, units: DisplayUnits): string {
  const { feet, inches } = feetInches(profile.heightCm);
  const height = units.height === 'ftIn' ? ` (they read ${feet} ft ${inches} in)` : '';
  const bodyFat =
    profile.bodyFat === undefined
      ? 'not set'
      : `${oneDecimal(profile.bodyFat * 100)} % (fraction ${num(profile.bodyFat, 3)})`;
  const goalWeight =
    profile.goalWeightKg === undefined ? 'not set' : weightText(profile.goalWeightKg, units.weight);
  return bullets([
    `Sex: ${profile.sex}`,
    `Age: ${ageOn(profile.birthDate, today)} years`,
    `Height: ${oneDecimal(profile.heightCm)} cm${height}`,
    `Weight: ${weightText(profile.weightKg, units.weight)}`,
    `Body fat: ${bodyFat}`,
    `Activity: ${profile.activity} (${ACTIVITY_WORDS[profile.activity]})`,
    `Goal: ${GOAL_WORDS[profile.goal]}`,
    `Weekly pace: ${paceText(profile, units.weight)}`,
    `Goal weight: ${goalWeight}`,
  ]);
}

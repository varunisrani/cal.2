/**
 * The plan request (01 §3.6): the model acts as our plan calculator and answers with the four
 * daily targets and a short why. It gets the formula set with every constant (taken from the
 * domain module, so the text follows the maths), which resting-burn equation applies, the rules
 * for leaning on the person's own data, the profile, the formula reference values, the current
 * targets and, when there is one, the evidence text. The reply is checked by `checkPlan`
 * (P01-14) before anything is saved.
 */
import type { DayKey } from '../../domain/dates/dayKey';
import type { EvidencePack } from '../../domain/forecast/evidence';
import {
  ACTIVITY_FACTORS,
  DEFAULT_WEEKLY_KG,
  FAT_PER_KG,
  KCAL_PER_GRAM,
  KCAL_PER_KG,
  LOSING_PROTEIN_EXTRA,
  bmr,
  bmrMethod,
  formulaPlan,
  tdee,
  type BmrMethod,
} from '../../domain/goals/formulas';
import { RAW_PLAN_RANGES } from '../../domain/goals/planValidator';
import { effectiveTargets } from '../../domain/goals/targets';
import { ACTIVITIES, type Profile } from '../../domain/model';
import { PLAN_REPLY_KEYS } from '../parse/planReply';
import { evidenceText } from './evidenceText';
import {
  bullets,
  energyAndMacros,
  jsonKey,
  kilojouleLine,
  lines,
  num,
  paragraphs,
  profileFacts,
  type DisplayUnits,
  type PromptText,
} from './shared';

/** The keys of a plan reply (glossary 17 §1.4), the ones `parse/planReply.ts` reads. */
export { PLAN_REPLY_KEYS };

/** The `why` must stay under this many characters. */
export const WHY_MAX_CHARS = 100;

/** How far protein may sit from the formula protein, as a share of it. */
export const PROTEIN_LEEWAY = 0.15;

/** The evidence periods a maintenance estimate may come from, in days. */
export const DATA_WINDOWS = [14, 28, 90] as const;

/** The least number of days between the first and last weigh-in a data estimate needs. */
export const MIN_WEIGH_IN_SPAN_DAYS = 14;

export interface PlanPromptInput {
  readonly profile: Profile;
  readonly today: DayKey;
  readonly units: DisplayUnits;
  /** The evidence pack (`buildEvidence`); none when the plan is built during onboarding. */
  readonly evidence?: EvidencePack;
}

const PLAN_SYSTEM =
  "You are the plan calculator of a food diary app. You set a person's daily kcal and macro " +
  'targets from the rules and data you are given, and you answer with one JSON object only.';

const K = PLAN_REPLY_KEYS;

const METHOD_LINES: Readonly<Record<BmrMethod, string>> = {
  katch: 'For this person the Katch-McArdle equation applies: their body fat is known.',
  mifflin: 'For this person the Mifflin-St Jeor equation applies: no body fat is set.',
};

/** One row per activity level: its daily-burn multiplier and its protein rate. */
function activityTable(): string {
  return bullets(
    ACTIVITIES.map((level) => {
      const { multiplier, proteinPerKg } = ACTIVITY_FACTORS[level];
      return `${level}: daily burn × ${multiplier}; protein ${proteinPerKg.toFixed(1)} g/kg`;
    }),
  );
}

function formulaSection(method: BmrMethod): string {
  const { protein, carbs, fat } = KCAL_PER_GRAM;
  return lines(
    'How the formula plan is worked out:',
    bullets([
      'Katch-McArdle resting burn (BMR), whenever body fat is known: 370 + 21.6 × kg × lean ' +
        'share, where lean share = 1 − the body fat fraction.',
      'Mifflin-St Jeor resting burn, when it is not: 10 × kg + 6.25 × cm − 5 × age in years − ' +
        '161, and men add 166 to that; women and other keep it as it is.',
      'Daily burn (TDEE) = BMR × the multiplier of their activity level (table below).',
      `Pace: ${KCAL_PER_KG} kcal per kg of body weight. Losing takes pace × ${KCAL_PER_KG} ÷ 7 ` +
        'kcal off the daily burn each day, gaining adds it, keeping weight changes nothing. ' +
        `Without a set pace it is ${DEFAULT_WEEKLY_KG} kg a week.`,
      'Protein: the rate of their activity level (table below) in g per kg of full body weight, ' +
        `plus ${LOSING_PROTEIN_EXTRA} g/kg while losing.`,
      `Fat: ${FAT_PER_KG} g per kg of body weight.`,
      'Carbs: the energy left after protein and fat.',
      `Energy per gram: protein ${protein} kcal, carbs ${carbs} kcal, fat ${fat} kcal.`,
    ]),
    'Activity levels:',
    activityTable(),
    METHOD_LINES[method],
  );
}

function referenceSection(profile: Profile, today: DayKey): string {
  const formula = formulaPlan(profile, today);
  const current = effectiveTargets(profile.saved, formula);
  return lines(
    'Formula reference values for this person, the anchor for your answer:',
    bullets([
      `BMR ${num(bmr(profile, today))} kcal, daily burn ${num(tdee(profile, today))} kcal`,
      `Formula plan: ${energyAndMacros(formula)}`,
    ]),
    `Their current targets: ${energyAndMacros(current)}.`,
  );
}

function rulesSection(): string {
  const { min, max } = RAW_PLAN_RANGES.kcal;
  const { protein, carbs, fat } = KCAL_PER_GRAM;
  return lines(
    'Rules for your answer:',
    bullets([
      `kcal between ${min} and ${max}.`,
      `${protein} × protein + ${carbs} × carbs + ${fat} × fat close to kcal.`,
      `Protein close to the formula protein, within about ${num(PROTEIN_LEEWAY * 100, 0)} % ` +
        'either way, leaning higher in a deficit. Never lower it to fit a small kcal target, and ' +
        'never read the rates above as lean-mass rates.',
      'Base the daily burn on, in this order of trust: a measured energy figure (none comes with ' +
        "this request), an estimate from the person's own data under the rules below, the " +
        'formula daily burn.',
    ]),
  );
}

function ownDataSection(evidence: EvidencePack | undefined): string {
  if (evidence === undefined) {
    return 'No logging data comes with this request, so use the formula daily burn.';
  }
  const windows = DATA_WINDOWS.join(', ').replace(/, (\d+)$/, ' or $1');
  const rules = lines(
    `Using the person's own data. You may estimate their maintenance from one of the ${windows}` +
      `-day periods of the evidence below: the average kcal of that period's full days, minus ` +
      `the energy of the weight change (${KCAL_PER_KG} kcal per kg) spread over the actual days ` +
      'between the first and last weigh-in, not over the length of the period. Only do so when ' +
      'all of these hold:',
    bullets([
      'the confidence is medium or high;',
      "at least half of that period's days are full;",
      `there are two or more weigh-ins at least ${MIN_WEIGH_IN_SPAN_DAYS} days apart;`,
      'the weight trend is believable.',
    ]),
    'Partial and none days never count. Follow the confidence and coverage labels, and never ' +
      'take a missing or partial day as low intake. When the conditions do not hold, use the ' +
      'formula daily burn.',
  );
  return paragraphs(rules, evidenceText(evidence));
}

function answerSection(): string {
  return (
    `Answer with one JSON object holding exactly ${jsonKey(K.kcal)}, ${jsonKey(K.protein)}, ` +
    `${jsonKey(K.carbs)} and ${jsonKey(K.fat)} as whole numbers (kcal a day, grams a day) and ` +
    `${jsonKey(K.why)}: one short sentence under ${WHY_MAX_CHARS} characters on what the plan ` +
    'rests on. No other keys and nothing around the object.'
  );
}

/** The plan request for `profile` on `today`, with the evidence pack when there is one. */
export function planPrompt(input: PlanPromptInput): PromptText {
  const { profile, today, units } = input;
  return {
    system: PLAN_SYSTEM,
    prompt: paragraphs(
      formulaSection(bmrMethod(profile)),
      lines('The person:', profileFacts(profile, today, units)),
      referenceSection(profile, today),
      rulesSection(),
      ownDataSection(input.evidence),
      answerSection(),
      kilojouleLine(units.energy, { replyFieldsInKcal: true }),
    ),
  };
}

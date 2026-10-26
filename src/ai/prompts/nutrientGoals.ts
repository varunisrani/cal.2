/**
 * The optional nutrient-goal request (01 §3.11, 03 §3.11), sent after a plan rebuild: whole
 * numbers for exactly the 29 goal keys, in their storage units, never kcal or macros. Limits are
 * ceilings and targets are floors; the sports compounds stay 0 unless the person asked for them.
 * The reply is read by `parse/nutrientGoals.ts`, which keeps the current goal for any key that
 * does not come back.
 */
import type { DayKey } from '../../domain/dates/dayKey';
import { EXTRA_KEYS, type Profile } from '../../domain/model';
import { GOAL_KEYS, unitOf } from '../../domain/nutrients/catalogue';
import { GOAL_SPECS, type GoalValues } from '../../domain/nutrients/goalDefaults';
import {
  bullets,
  energyAndMacros,
  lines,
  num,
  paragraphs,
  profileFacts,
  type DisplayUnits,
  type EnergyAndMacros,
  type PromptText,
} from './shared';

export interface NutrientGoalsPromptInput {
  readonly profile: Profile;
  readonly today: DayKey;
  readonly units: DisplayUnits;
  /** The daily kcal and macro targets in effect. */
  readonly targets: EnergyAndMacros;
  /** The person's current goal for every key. */
  readonly current: Readonly<GoalValues>;
}

const GOALS_SYSTEM =
  'You suggest daily nutrient goals for a food diary app, and you answer with one JSON object ' +
  'only.';

function goalLine(key: (typeof GOAL_KEYS)[number], current: Readonly<GoalValues>): string {
  return `${key}: ${unitOf(key)}, ${GOAL_SPECS[key].kind}, now ${num(current[key])}`;
}

/** The request for new optional nutrient goals for the person and their targets. */
export function nutrientGoalsPrompt(input: NutrientGoalsPromptInput): PromptText {
  return {
    system: GOALS_SYSTEM,
    prompt: paragraphs(
      'Suggest practical daily goals for the nutrients listed below, for the person described.',
      lines('The person:', profileFacts(input.profile, input.today, input.units)),
      `Their daily targets, which stay as they are: ${energyAndMacros(input.targets)}.`,
      lines(
        'The nutrients, as key: unit, kind, current goal:',
        bullets(GOAL_KEYS.map((key) => goalLine(key, input.current))),
      ),
      lines(
        'Rules:',
        bullets([
          'A limit is a ceiling to stay under; a target is an amount to reach at least.',
          `The sports compounds (${EXTRA_KEYS.join(', ')}) stay 0 unless the person has asked ` +
            'for them in their notes.',
          'Start from general guidance for adults and adjust it to this profile and kcal ' +
            'target: added sugar and saturated fat at about 10 % of kcal or less, fibre near 14 g ' +
            'per 1000 kcal, a careful caffeine limit, sodium close to general guidance.',
        ]),
      ),
      `Answer with one JSON object whose keys are exactly the ${GOAL_KEYS.length} keys above, ` +
        'each with a whole number in the unit shown, and nothing around it. Never include kcal, ' +
        'protein, carbs or fat.',
    ),
  };
}

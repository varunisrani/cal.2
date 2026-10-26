/**
 * The fit check (03 §3.11): before logging, does this meal fit today? A prose request (no JSON)
 * for 2 to 4 short plain sentences with one practical next step, concrete numbers, nothing
 * medical, and never a claim that anything was logged or changed. It carries the profile, the
 * targets, today's totals before and after the meal, what is left, and up to 12 of today's meals.
 * People who read kJ get the kJ line.
 */
import type { DayKey } from '../../domain/dates/dayKey';
import type { Profile } from '../../domain/model';
import {
  bullets,
  energyAndMacros,
  kilojouleLine,
  lines,
  paragraphs,
  profileFacts,
  quoted,
  type DisplayUnits,
  type EnergyAndMacros,
  type PromptText,
} from './shared';

/** The most of today's meals a fit check lists; the newest are kept. */
export const MAX_FIT_CHECK_MEALS = 12;

/** The most words the answer may take. */
export const FIT_CHECK_MAX_WORDS = 90;

/** A named meal's kcal and macros. */
export interface MealFigures extends EnergyAndMacros {
  readonly name: string;
}

export interface FitCheckInput {
  readonly profile: Profile;
  readonly today: DayKey;
  readonly units: DisplayUnits;
  /** The daily targets in effect. */
  readonly targets: EnergyAndMacros;
  /** Today's totals before this meal. */
  readonly eaten: EnergyAndMacros;
  /** The meal being checked. */
  readonly meal: MealFigures;
  /** Today's logged meals, oldest first. */
  readonly todaysMeals: readonly MealFigures[];
}

const FIT_SYSTEM =
  'You are a practical nutrition helper inside a food diary app. You are not a doctor and you ' +
  'give no medical advice.';

function sum(a: EnergyAndMacros, b: EnergyAndMacros): EnergyAndMacros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

function difference(a: EnergyAndMacros, b: EnergyAndMacros): EnergyAndMacros {
  return {
    kcal: a.kcal - b.kcal,
    protein: a.protein - b.protein,
    carbs: a.carbs - b.carbs,
    fat: a.fat - b.fat,
  };
}

function mealLine(meal: MealFigures): string {
  return `${quoted(meal.name)}: ${energyAndMacros(meal)}`;
}

/** Today's meals, the newest `MAX_FIT_CHECK_MEALS` of them, with a count of any left out. */
function mealsSection(meals: readonly MealFigures[]): string {
  if (meals.length === 0) return 'Nothing else is logged today.';
  const shown = meals.slice(-MAX_FIT_CHECK_MEALS);
  const left = meals.length - shown.length;
  const heading =
    left > 0
      ? `Today's meals so far, the newest ${shown.length} of ${meals.length} (${left} earlier ` +
        'left out):'
      : "Today's meals so far:";
  return lines(heading, bullets(shown.map(mealLine)));
}

/** The fit-check request for one meal against today. */
export function fitCheckPrompt(input: FitCheckInput): PromptText {
  const after = sum(input.eaten, input.meal);
  return {
    system: FIT_SYSTEM,
    prompt: paragraphs(
      'The person is thinking of eating the meal below and wants to know whether it fits today.',
      lines('The person:', profileFacts(input.profile, input.today, input.units)),
      lines(
        'Today in numbers:',
        bullets([
          `Daily targets: ${energyAndMacros(input.targets)}`,
          `Eaten today before this meal: ${energyAndMacros(input.eaten)}`,
          `This meal, ${mealLine(input.meal)}`,
          `Totals if they log it: ${energyAndMacros(after)}`,
          `Left after it (a negative amount is over the target): ` +
            energyAndMacros(difference(input.targets, after)),
        ]),
      ),
      mealsSection(input.todaysMeals),
      lines(
        'How to answer:',
        bullets([
          `2 to 4 short plain sentences, under ${FIT_CHECK_MAX_WORDS} words in all, with no ` +
            'markdown, headings or bullet points.',
          "Say whether this meal fits today's targets.",
          'Give one practical next step: log it as it is, eat less of it, swap part of it, add ' +
            'protein or fibre, or balance the next meal.',
          'Use the concrete numbers above.',
          'Nothing medical.',
          'Do not say the meal is logged or that any goal has changed: this answer logs and ' +
            'changes nothing.',
        ]),
      ),
      kilojouleLine(input.units.energy),
    ),
  };
}

import { describe, expect, it } from 'vitest';
import { FIXTURE_TODAY, profileWith } from '../../domain/goals/__fixtures__/profiles';
import {
  FIT_CHECK_MAX_WORDS,
  MAX_FIT_CHECK_MEALS,
  fitCheckPrompt,
  type FitCheckInput,
  type MealFigures,
} from './fitCheck';

/** `count` meals named "Dish 01", "Dish 02", … in the order they were logged. */
function meals(count: number): MealFigures[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Dish ${String(index + 1).padStart(2, '0')}`,
    kcal: 100 + index,
    protein: 5,
    carbs: 12.5,
    fat: 3,
  }));
}

function inputWith(changes: Partial<FitCheckInput> = {}): FitCheckInput {
  return {
    profile: profileWith({ goal: 'lose', bodyFat: 0.24 }),
    today: FIXTURE_TODAY,
    units: { energy: 'kcal', weight: 'kg', height: 'cm' },
    targets: { kcal: 1900, protein: 140, carbs: 190, fat: 60 },
    eaten: { kcal: 1320, protein: 88.4, carbs: 151, fat: 41.2 },
    meal: { name: 'Mushroom risotto', kcal: 640.4, protein: 18, carbs: 82.5, fat: 24.1 },
    todaysMeals: meals(3),
    ...changes,
  };
}

describe("fitCheckPrompt: today's meals", () => {
  it('lists at most 12 meals, the newest, and says how many earlier ones were left out', () => {
    const { prompt } = fitCheckPrompt(inputWith({ todaysMeals: meals(15) }));
    expect(MAX_FIT_CHECK_MEALS).toBe(12);
    const listed = prompt.match(/^- "Dish \d{2}":/gm) ?? [];
    expect(listed).toHaveLength(12);
    for (const gone of ['Dish 01', 'Dish 02', 'Dish 03']) expect(prompt).not.toContain(gone);
    expect(prompt).toContain('- "Dish 04": 103 kcal, protein 5 g, carbs 12.5 g, fat 3 g');
    expect(prompt).toContain('- "Dish 15": 114 kcal');
    expect(prompt).toContain("Today's meals so far, the newest 12 of 15 (3 earlier left out):");
  });

  it('lists all of them, with no note, when there are 12 or fewer', () => {
    const { prompt } = fitCheckPrompt(inputWith({ todaysMeals: meals(12) }));
    expect(prompt.match(/^- "Dish \d{2}":/gm)).toHaveLength(12);
    expect(prompt).toContain("Today's meals so far:");
    expect(prompt).not.toContain('left out');
  });

  it('says nothing else is logged when today is empty', () => {
    expect(fitCheckPrompt(inputWith({ todaysMeals: [] })).prompt).toContain(
      'Nothing else is logged today.',
    );
  });
});

describe('fitCheckPrompt: the numbers', () => {
  it('gives the targets, the totals before and after the meal, and what is left or over', () => {
    const { prompt } = fitCheckPrompt(inputWith());
    expect(prompt).toContain('- Daily targets: 1900 kcal, protein 140 g, carbs 190 g, fat 60 g');
    expect(prompt).toContain(
      '- Eaten today before this meal: 1320 kcal, protein 88.4 g, carbs 151 g, fat 41.2 g',
    );
    expect(prompt).toContain(
      '- This meal, "Mushroom risotto": 640 kcal, protein 18 g, carbs 82.5 g, fat 24.1 g',
    );
    expect(prompt).toContain(
      '- Totals if they log it: 1960 kcal, protein 106.4 g, carbs 233.5 g, fat 65.3 g',
    );
    expect(prompt).toContain(
      '- Left after it (a negative amount is over the target): -60 kcal, protein 33.6 g, carbs -43.5 g, fat -5.3 g',
    );
  });

  it('carries the profile: sex, age, weight, body fat, activity and goal', () => {
    const { prompt } = fitCheckPrompt(inputWith());
    expect(prompt).toContain('- Sex: male');
    expect(prompt).toContain('- Age: 25 years');
    expect(prompt).toContain('- Weight: 70.0 kg');
    expect(prompt).toContain('- Body fat: 24.0 %');
    expect(prompt).toContain('- Activity: moderate');
    expect(prompt).toContain('- Goal: lose weight');
  });

  it('keeps a meal name with line breaks on its own quoted line', () => {
    const meal = { ...inputWith().meal, name: 'Leftover\nchilli' };
    expect(fitCheckPrompt(inputWith({ meal })).prompt).toContain('- This meal, "Leftover chilli":');
  });
});

describe('fitCheckPrompt: how to answer', () => {
  it('asks for 2 to 4 short plain sentences with one practical next step and concrete numbers', () => {
    const { prompt } = fitCheckPrompt(inputWith());
    expect(prompt).toContain(`2 to 4 short plain sentences, under ${FIT_CHECK_MAX_WORDS} words`);
    expect(prompt).toContain('no markdown, headings or bullet points');
    expect(prompt).toContain("Say whether this meal fits today's targets.");
    expect(prompt).toContain(
      'Give one practical next step: log it as it is, eat less of it, swap part',
    );
    expect(prompt).toContain('Use the concrete numbers above.');
  });

  it('stays non-medical and never claims the meal was logged or a goal changed', () => {
    const { system, prompt } = fitCheckPrompt(inputWith());
    expect(prompt).toContain('Nothing medical.');
    expect(system).toContain('give no medical advice');
    expect(prompt).toContain('Do not say the meal is logged or that any goal has changed');
  });

  it('is a prose request: no JSON is asked for', () => {
    const { system, prompt } = fitCheckPrompt(inputWith());
    expect(`${system}\n${prompt}`).not.toMatch(/json/i);
  });

  it('adds the kJ line only for kJ readers', () => {
    const kj = fitCheckPrompt(inputWith({ units: { energy: 'kJ', weight: 'kg', height: 'ftIn' } }));
    expect(kj.prompt).toContain('The person reads energy in kilojoules');
    expect(kj.prompt).toContain('4.184');
    expect(kj.prompt).not.toContain('Number fields');
    expect(fitCheckPrompt(inputWith()).prompt).not.toContain('kilojoules');
  });
});

import { describe, expect, it } from 'vitest';
import { FIXTURE_TODAY, defaultProfile } from '../../domain/goals/__fixtures__/profiles';
import { EXTRA_KEYS, MACRO_KEYS } from '../../domain/model';
import { GOAL_KEYS, unitOf } from '../../domain/nutrients/catalogue';
import {
  DEFAULT_GOAL_VALUES,
  GOAL_SPECS,
  withGoalValue,
} from '../../domain/nutrients/goalDefaults';
import { nutrientGoalsPrompt, type NutrientGoalsPromptInput } from './nutrientGoals';

const input: NutrientGoalsPromptInput = {
  profile: defaultProfile,
  today: FIXTURE_TODAY,
  units: { energy: 'kcal', weight: 'kg', height: 'cm' },
  targets: { kcal: 2452, protein: 112, carbs: 406, fat: 42 },
  current: withGoalValue(withGoalValue(DEFAULT_GOAL_VALUES, 'sodium', 2345), 'creatine', 5),
};

/** The keys of the "- key: unit, kind, now n" lines. */
function listedKeys(prompt: string): string[] {
  return [...prompt.matchAll(/^- (\w+): (g|mg|mcg), (limit|target), now /gm)].map(
    (match) => match[1] ?? '',
  );
}

describe('nutrientGoalsPrompt: the 29 goals and nothing else', () => {
  it('lists exactly the 29 optional goal keys, each with its unit, kind and current goal', () => {
    const { prompt } = nutrientGoalsPrompt(input);
    expect(GOAL_KEYS).toHaveLength(29);
    expect(listedKeys(prompt)).toEqual([...GOAL_KEYS]);
    for (const key of GOAL_KEYS) {
      const value = key === 'sodium' ? 2345 : key === 'creatine' ? 5 : DEFAULT_GOAL_VALUES[key];
      expect(prompt).toContain(`- ${key}: ${unitOf(key)}, ${GOAL_SPECS[key].kind}, now ${value}\n`);
    }
  });

  it('asks for whole numbers for exactly those keys and never kcal or macros', () => {
    const { prompt } = nutrientGoalsPrompt(input);
    expect(prompt).toContain('keys are exactly the 29 keys above, each with a whole number');
    expect(prompt).toContain('Never include kcal, protein, carbs or fat.');
    for (const macro of MACRO_KEYS) expect(listedKeys(prompt)).not.toContain(macro);
    expect(listedKeys(prompt)).not.toContain('monounsaturatedFat');
  });

  it('treats limits as ceilings and targets as floors', () => {
    const { prompt } = nutrientGoalsPrompt(input);
    expect(prompt).toContain(
      'A limit is a ceiling to stay under; a target is an amount to reach at least.',
    );
    expect(prompt).toContain('- sodium: mg, limit, now 2345');
    expect(prompt).toContain('- fibre: g, target, now 30');
  });

  it('keeps the sports compounds at 0 unless the person asked for them', () => {
    const { prompt } = nutrientGoalsPrompt(input);
    expect(prompt).toContain(`The sports compounds (${EXTRA_KEYS.join(', ')}) stay 0 unless`);
  });

  it('gives the general guidance to adjust: sugars and saturated fat, fibre per 1000 kcal', () => {
    const { prompt } = nutrientGoalsPrompt(input);
    expect(prompt).toContain('added sugar and saturated fat at about 10 % of kcal or less');
    expect(prompt).toContain('fibre near 14 g per 1000 kcal');
    expect(prompt).toContain('a careful caffeine limit');
  });
});

describe('nutrientGoalsPrompt: the person', () => {
  it('carries the profile and the kcal and macro targets', () => {
    const { system, prompt } = nutrientGoalsPrompt(input);
    expect(prompt).toContain('- Age: 25 years');
    expect(prompt).toContain('- Weight: 70.0 kg');
    expect(prompt).toContain('- Activity: moderate');
    expect(prompt).toContain('2452 kcal, protein 112 g, carbs 406 g, fat 42 g');
    expect(system).toContain('one JSON object only');
  });

  it('has no kJ line: the answer is numbers for the app, not words for the person', () => {
    const { prompt } = nutrientGoalsPrompt({ ...input, units: { ...input.units, energy: 'kJ' } });
    expect(prompt).not.toContain('kilojoules');
  });
});

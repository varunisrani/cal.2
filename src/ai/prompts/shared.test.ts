import { describe, expect, it } from 'vitest';
import {
  FIXTURE_TODAY,
  defaultProfile,
  profileWith,
} from '../../domain/goals/__fixtures__/profiles';
import { EXTRA_KEYS, NUTRIENT_KEYS } from '../../domain/model';
import { NUTRIENT_UNITS } from '../../domain/nutrients/catalogue';
import {
  compactRetryNote,
  kilojouleLine,
  NUTRIENT_UNIT_LIST,
  oneDecimal,
  paragraphs,
  profileFacts,
  quoted,
  type DisplayUnits,
} from './shared';

const METRIC: DisplayUnits = { energy: 'kcal', weight: 'kg', height: 'cm' };
const FEET_INCHES: DisplayUnits = { energy: 'kJ', weight: 'kg', height: 'ftIn' };

/** The words of a unit-list line after its label: "- grams (g): a, b" → ["a", "b"]. */
function keysOnLine(unitLabel: string): string[] {
  const line = NUTRIENT_UNIT_LIST.split('\n').find((row) => row.includes(`(${unitLabel}):`));
  if (line === undefined) throw new Error(`no line for ${unitLabel}`);
  return line
    .slice(line.indexOf(':') + 1)
    .split(',')
    .map((key) => key.trim());
}

describe('kilojouleLine (01 §3.2)', () => {
  it('gives kcal readers nothing, so their prompts stay exactly as they are', () => {
    expect(kilojouleLine('kcal')).toBeUndefined();
    expect(kilojouleLine('kcal', { replyFieldsInKcal: true })).toBeUndefined();
  });

  it('tells the model a kJ reader gets whole kJ at 4.184 while every figure sent is kcal', () => {
    const line = kilojouleLine('kJ') ?? '';
    expect(line).toContain('kilojoules');
    expect(line).toContain('in kcal');
    expect(line).toContain('4.184');
    expect(line).toContain('whole number');
    expect(line).not.toContain('Number fields');
  });

  it('keeps reply number fields in kcal when the reply has them', () => {
    expect(kilojouleLine('kJ', { replyFieldsInKcal: true })).toContain(
      'Number fields of the reply stay in kcal',
    );
  });
});

describe('NUTRIENT_UNIT_LIST', () => {
  it('puts every nutrient key on the line of its storage unit, exactly once', () => {
    for (const unit of ['g', 'mg', 'mcg'] as const) {
      const listed = keysOnLine(unit);
      const expected = NUTRIENT_KEYS.filter((key) => NUTRIENT_UNITS[key] === unit);
      for (const key of expected) expect(listed).toContain(key);
    }
    const all = ['g', 'mg', 'mcg'].flatMap(keysOnLine);
    expect(all).toHaveLength(NUTRIENT_KEYS.length + EXTRA_KEYS.length);
    expect(new Set(all).size).toBe(all.length);
  });

  it('lists the 8 sports compounds with the grams', () => {
    expect(EXTRA_KEYS).toHaveLength(8);
    expect(keysOnLine('g')).toEqual(expect.arrayContaining([...EXTRA_KEYS]));
    expect(keysOnLine('mg')).not.toContain('creatine');
  });

  it('names the units in words: sodium in milligrams, vitamin D in micrograms', () => {
    expect(NUTRIENT_UNIT_LIST).toMatch(/milligrams \(mg\):[^\n]*\bsodium\b/);
    expect(NUTRIENT_UNIT_LIST).toMatch(/micrograms \(mcg\):[^\n]*\bvitaminD\b/);
    expect(NUTRIENT_UNIT_LIST).toMatch(/grams \(g\):[^\n]*\bfibre\b/);
  });
});

describe('compactRetryNote (03 §3.8)', () => {
  it('says the answer was cut off and carries the token budget', () => {
    const note = compactRetryNote(1024, 'json');
    expect(note).toContain('cut off');
    expect(note).toContain('under 1024 tokens');
  });

  it('asks a JSON request for the bare object alone: no reasoning, no remarks, no fence', () => {
    const note = compactRetryNote(700, 'json');
    expect(note).toContain('JSON object again and nothing else');
    expect(note).toContain('no code fence');
    expect(note).toContain('no reasoning');
    expect(note).toContain('under 700 tokens');
  });

  it('asks a prose request for a short plain reply without JSON', () => {
    const note = compactRetryNote(300, 'prose');
    expect(note).toContain('short plain sentences');
    expect(note).toContain('without JSON');
    expect(note).toContain('under 300 tokens');
    expect(note).not.toContain('JSON object');
  });

  it('writes the budget as a whole number of at least 1, with no grouping marks', () => {
    expect(compactRetryNote(4096, 'json')).toContain('under 4096 tokens');
    expect(compactRetryNote(512.9, 'json')).toContain('under 512 tokens');
    expect(compactRetryNote(0, 'json')).toContain('under 1 tokens');
    expect(compactRetryNote(Number.NaN, 'prose')).toContain('under 1 tokens');
  });
});

describe('profileFacts', () => {
  it('gives the metric values to one decimal and nothing more for a metric reader', () => {
    const facts = profileFacts(defaultProfile, FIXTURE_TODAY, METRIC);
    expect(facts).toContain('- Sex: male');
    expect(facts).toContain('- Age: 25 years');
    expect(facts).toContain('- Height: 175.0 cm\n');
    expect(facts).toContain('- Weight: 70.0 kg\n');
    expect(facts).toContain('- Activity: moderate (');
    expect(facts).toContain('- Body fat: not set');
    expect(facts).toContain('- Weekly pace: not set');
    expect(facts).toContain('- Goal weight: not set');
    expect(facts).not.toContain('they read');
  });

  it('adds feet and inches for a person who reads height that way; weight stays kg (D-16.91)', () => {
    const profile = profileWith({ goal: 'lose', weeklyKg: 0.25, goalWeightKg: 65 });
    const facts = profileFacts(profile, FIXTURE_TODAY, FEET_INCHES);
    expect(facts).toContain('Height: 175.0 cm (they read 5 ft 9 in)');
    expect(facts).toContain('- Weight: 70.0 kg\n');
    expect(facts).toContain('- Weekly pace: 0.25 kg a week\n');
    expect(facts).toContain('- Goal weight: 65.0 kg');
    expect(facts).toContain('Goal: lose weight');
    expect(facts).not.toMatch(/\blb\b|pound/);
  });

  it('rounds the height to the nearest inch: 170 cm reads 5 ft 7 in', () => {
    const facts = profileFacts(profileWith({ heightCm: 170 }), FIXTURE_TODAY, FEET_INCHES);
    expect(facts).toContain('(they read 5 ft 7 in)');
  });

  it('gives body fat as a percent and as a fraction', () => {
    const facts = profileFacts(profileWith({ bodyFat: 0.235 }), FIXTURE_TODAY, METRIC);
    expect(facts).toContain('Body fat: 23.5 % (fraction 0.235)');
  });

  it('names the default pace when lose or gain has none set', () => {
    const facts = profileFacts(profileWith({ goal: 'gain' }), FIXTURE_TODAY, METRIC);
    expect(facts).toContain('Weekly pace: 0.5 kg a week, the default');
  });
});

describe('text helpers', () => {
  it("keeps the person's words on one quoted line", () => {
    expect(quoted('  two eggs,\n\ttoast  and   tea ')).toBe('"two eggs, toast and tea"');
  });

  it('writes exactly one decimal with a dot', () => {
    expect(oneDecimal(70)).toBe('70.0');
    expect(oneDecimal(154.3236)).toBe('154.3');
    expect(oneDecimal(-0.04)).toBe('0.0');
  });

  it('drops empty paragraphs', () => {
    expect(paragraphs('one', undefined, '  ', false, 'two')).toBe('one\n\ntwo');
  });
});

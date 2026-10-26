import { describe, expect, it } from 'vitest';
import type { PillarKey } from './catalogue';
import { DEFAULT_GOAL_VALUES, withGoalValue } from './goalDefaults';
import { decodePillars, DEFAULT_PILLARS, MAX_PILLARS, pillarGoal, togglePillar } from './pillars';

describe('decodePillars', () => {
  it('trims, drops unknown names and repeats, and keeps the picked order', () => {
    expect(decodePillars(' fat ,fat, foo,protein')).toEqual(['fat', 'protein']);
    expect(decodePillars(['sodium', 'sodium', 'unknown'])).toEqual(['sodium']);
  });

  it('keeps one to four choices as they were stored', () => {
    const choices: PillarKey[] = ['sodium', 'fibre', 'protein', 'carbs'];
    for (let count = 1; count <= MAX_PILLARS; count += 1) {
      const stored = choices.slice(0, count);
      expect(decodePillars(stored)).toEqual(stored);
      expect(decodePillars(stored.join(','))).toEqual(stored);
    }
  });

  it('keeps only the first four valid names', () => {
    expect(decodePillars('sugar,foo,iron,zinc,creatine,protein')).toEqual([
      'sugar',
      'iron',
      'zinc',
      'creatine',
    ]);
  });

  it('falls back to protein, carbs, fat and fibre when nothing valid is left', () => {
    expect(DEFAULT_PILLARS).toEqual(['protein', 'carbs', 'fat', 'fibre']);
    for (const stored of [
      '',
      ' , ',
      'unknown',
      'monounsaturatedFat',
      [],
      [1, null],
      null,
      42,
      {},
    ]) {
      expect(decodePillars(stored)).toEqual(DEFAULT_PILLARS);
    }
  });

  it('skips array members that are not strings', () => {
    expect(decodePillars([3, ' iron ', null, 'iron', 'fat'])).toEqual(['iron', 'fat']);
  });

  it('returns a new array every time', () => {
    const first = decodePillars(null);
    first.push('iron');
    expect(decodePillars(null)).toEqual(['protein', 'carbs', 'fat', 'fibre']);
  });
});

describe('togglePillar', () => {
  it('adds a new pick at the end while fewer than four are chosen', () => {
    expect(togglePillar(['protein'], 'iron')).toEqual(['protein', 'iron']);
    expect(togglePillar(['protein', 'carbs', 'fat'], 'iron')).toEqual([
      'protein',
      'carbs',
      'fat',
      'iron',
    ]);
  });

  it('lets a fifth pick replace the most recently added one', () => {
    const afterAdd = togglePillar(['protein', 'carbs', 'fat'], 'iron');
    expect(togglePillar(afterAdd, 'zinc')).toEqual(['protein', 'carbs', 'fat', 'zinc']);
  });

  it('removes a chosen pillar and keeps the others in order', () => {
    expect(togglePillar(['protein', 'carbs', 'fat', 'fibre'], 'carbs')).toEqual([
      'protein',
      'fat',
      'fibre',
    ]);
  });

  it('refuses to remove the only pillar', () => {
    const only: readonly PillarKey[] = ['sodium'];
    expect(togglePillar(only, 'sodium')).toBe(only);
    expect(only).toEqual(['sodium']);
  });

  it('never changes the selection it is given', () => {
    const selection: readonly PillarKey[] = ['protein', 'carbs', 'fat', 'fibre'];
    togglePillar(selection, 'iron');
    togglePillar(selection, 'fat');
    expect(selection).toEqual(['protein', 'carbs', 'fat', 'fibre']);
  });
});

describe('pillarGoal', () => {
  it('takes macros from the targets and everything else from the optional goals', () => {
    const targets = { kcal: 2_000, protein: 150, carbs: 200, fat: 67 };
    const goals = withGoalValue(DEFAULT_GOAL_VALUES, 'creatine', 5);
    expect(pillarGoal('protein', targets, goals)).toBe(150);
    expect(pillarGoal('fat', targets, goals)).toBe(67);
    expect(pillarGoal('fibre', targets, goals)).toBe(30);
    expect(pillarGoal('sodium', targets, goals)).toBe(2_300);
    expect(pillarGoal('creatine', targets, goals)).toBe(5);
    expect(pillarGoal('taurine', targets, goals)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { PillarKey } from './catalogue';
import { DEFAULT_PILLARS, normalisePillars, readPillars, togglePillar } from './pillars';

describe('readPillars', () => {
  it('trims names, drops unknown ones and repeats: " fat ,fat, foo,protein" → fat, protein', () => {
    expect(readPillars(' fat ,fat, foo,protein')).toEqual(['fat', 'protein']);
  });

  it('keeps one to four choices in their stored order', () => {
    const choices: PillarKey[] = ['sodium', 'fibre', 'protein', 'creatine'];
    for (let count = 1; count <= 4; count++) {
      const chosen = choices.slice(0, count);
      expect(readPillars(chosen.join(','))).toEqual(chosen);
      expect(readPillars(chosen)).toEqual(chosen);
    }
  });

  it('keeps only the first four valid choices', () => {
    expect(readPillars('iron,zinc,calcium,vitaminD,folate')).toEqual([
      'iron',
      'zinc',
      'calcium',
      'vitaminD',
    ]);
    expect(readPillars('iron,iron,bogus,zinc,calcium,iron,vitaminD,folate')).toEqual([
      'iron',
      'zinc',
      'calcium',
      'vitaminD',
    ]);
  });

  it('falls back to protein, carbs, fat and fibre when nothing valid is left', () => {
    for (const raw of ['', ' , ', 'fiber', 'monounsaturatedFat', [], [1, null], null, 7, {}]) {
      expect(readPillars(raw)).toEqual(['protein', 'carbs', 'fat', 'fibre']);
    }
  });

  it('reads a stored list, skipping entries that are not names', () => {
    expect(readPillars([' sodium', 42, 'sodium', 'potassium'])).toEqual(['sodium', 'potassium']);
  });

  it('returns a fresh list each time', () => {
    const first = readPillars('');
    first.push('iron');
    expect(readPillars('')).toEqual([...DEFAULT_PILLARS]);
    expect(DEFAULT_PILLARS).toEqual(['protein', 'carbs', 'fat', 'fibre']);
  });
});

describe('normalisePillars', () => {
  it('drops repeats, keeps four and falls back to the defaults', () => {
    expect(normalisePillars(['fat', 'fat', 'carbs'])).toEqual(['fat', 'carbs']);
    expect(normalisePillars(['iron', 'zinc', 'iron', 'calcium', 'folate', 'fat'])).toEqual([
      'iron',
      'zinc',
      'calcium',
      'folate',
    ]);
    expect(normalisePillars([])).toEqual([...DEFAULT_PILLARS]);
  });
});

describe('togglePillar', () => {
  it('adds a new choice at the end while fewer than four are chosen', () => {
    expect(togglePillar(['protein', 'sodium'], 'iron')).toEqual(['protein', 'sodium', 'iron']);
  });

  it('removes a chosen nutrient', () => {
    expect(togglePillar(['protein', 'carbs', 'fat', 'fibre'], 'carbs')).toEqual([
      'protein',
      'fat',
      'fibre',
    ]);
  });

  it('refuses to remove the only chosen nutrient', () => {
    expect(togglePillar(['sodium'], 'sodium')).toEqual(['sodium']);
  });

  it('lets a fifth pick replace the most recently added one', () => {
    const chosen: PillarKey[] = ['protein', 'carbs', 'fat'];
    const four = togglePillar(chosen, 'caffeine');
    expect(four).toEqual(['protein', 'carbs', 'fat', 'caffeine']);
    const swapped = togglePillar(four, 'iron');
    expect(swapped).toEqual(['protein', 'carbs', 'fat', 'iron']);
    // The replacement is now the most recent pick, so the next fifth pick replaces it.
    expect(togglePillar(swapped, 'zinc')).toEqual(['protein', 'carbs', 'fat', 'zinc']);
  });

  it('replaces the latest pick, not the last default, after a removal and re-add', () => {
    const fewer = togglePillar(['protein', 'carbs', 'fat', 'fibre'], 'carbs');
    const readded = togglePillar(fewer, 'sugar');
    expect(readded).toEqual(['protein', 'fat', 'fibre', 'sugar']);
    expect(togglePillar(readded, 'sodium')).toEqual(['protein', 'fat', 'fibre', 'sodium']);
  });

  it('never changes the list it was given', () => {
    const chosen: PillarKey[] = ['protein', 'carbs'];
    togglePillar(chosen, 'fat');
    togglePillar(chosen, 'carbs');
    expect(chosen).toEqual(['protein', 'carbs']);
  });
});

import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../model';
import { combinedName, combineEntries, type CombineWords } from './combine';

const WORDS: CombineWords = { fallbackName: 'Mixed plate', more: (count) => `${count} more` };

let nextId = 0;
function entryOf(fields: Partial<DiaryEntry> = {}): DiaryEntry {
  nextId += 1;
  return {
    id: `e-${nextId}`,
    name: `Food ${nextId}`,
    kcal: 100,
    protein: 5,
    carbs: 10,
    fat: 2,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 100 },
    units: [],
    lines: [],
    progressive: false,
    loggedAt: 1_000,
    dayKey: '2026-10-26',
    meal: 'lunch',
    source: 'photo',
    photoIds: [],
    ...fields,
  };
}

const named = (...names: string[]) => names.map((name) => entryOf({ name }));

describe('combinedName', () => {
  it('joins two or three names with " + "', () => {
    expect(combinedName(named('A', 'B'), WORDS)).toBe('A + B');
    expect(combinedName(named('Rice', 'Dal', 'Raita'), WORDS)).toBe('Rice + Dal + Raita');
  });

  it('lists the first two and how many more past three', () => {
    expect(combinedName(named('A', 'B', 'C', 'D'), WORDS)).toBe('A + B + 2 more');
    expect(combinedName(named('A', 'B', 'C', 'D', 'E', 'F'), WORDS)).toBe('A + B + 4 more');
  });

  it('trims names, skips blank ones and falls back to the caller name for none', () => {
    expect(combinedName(named('  Tea ', '', '   ', 'Toast'), WORDS)).toBe('Tea + Toast');
    expect(combinedName(named('', ' '), WORDS)).toBe('Mixed plate');
  });
});

describe('combineEntries', () => {
  it('sums the totals and takes time, day and meal from the latest entry', () => {
    const eggs = entryOf({
      name: 'Eggs',
      kcal: 155,
      protein: 13,
      carbs: 1.1,
      fat: 11,
      loggedAt: 2_000,
      dayKey: '2026-10-25',
      meal: 'breakfast',
      basis: { kind: 'grams', grams: 110 },
    });
    const juice = entryOf({
      name: 'Juice',
      kcal: 112,
      protein: 1.7,
      carbs: 26,
      fat: 0.5,
      loggedAt: 5_000,
      dayKey: '2026-10-26',
      meal: 'snack',
      basis: { kind: 'grams', grams: 250 },
    });
    const combined = combineEntries([eggs, juice], WORDS);
    expect(combined).not.toBeNull();
    expect(combined).toMatchObject({
      name: 'Eggs + Juice',
      kcal: 267,
      loggedAt: 5_000,
      dayKey: '2026-10-26',
      meal: 'snack',
      source: 'manual',
      basis: { kind: 'grams', grams: 360 },
      units: [],
      progressive: false,
    });
    expect(combined?.protein).toBeCloseTo(14.7, 10);
    expect(combined?.carbs).toBeCloseTo(27.1, 10);
    expect(combined?.fat).toBeCloseTo(11.5, 10);
    expect(combined?.lines.map((part) => [part.name, part.grams, part.kcal])).toEqual([
      ['Eggs', 110, 155],
      ['Juice', 250, 112],
    ]);
    expect(combined).not.toHaveProperty('id');
  });

  it('picks the first of two entries logged at the same latest time', () => {
    const a = entryOf({ loggedAt: 9_000, meal: 'dinner' });
    const b = entryOf({ loggedAt: 9_000, meal: 'snack' });
    const c = entryOf({ loggedAt: 1_000, meal: 'breakfast' });
    expect(combineEntries([c, a, b], WORDS)?.meal).toBe('dinner');
  });

  it('keeps every photo once, in order, and the first emoji', () => {
    const toast = entryOf({
      photoIds: ['p1', 'p2'],
      lines: [
        { name: 'Jam', grams: 20, kcal: 50, protein: 0, carbs: 13, fat: 0, photoIds: ['p3'] },
      ],
    });
    const tea = entryOf({ photoIds: ['p2', 'p4'], emoji: '🍵' });
    const cake = entryOf({ photoIds: ['p4'], emoji: '🍰' });
    const combined = combineEntries([toast, tea, cake], WORDS);
    // One line per entry: the toast's own jam line is not expanded.
    expect(combined?.lines).toHaveLength(3);
    expect(combined?.photoIds).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(combined?.emoji).toBe('🍵');
    expect(combined?.lines.map((part) => part.photoIds)).toEqual([
      ['p1', 'p2', 'p3'],
      ['p2', 'p4'],
      ['p4'],
    ]);
    expect(combined?.lines[1]?.emoji).toBe('🍵');
    expect(combined?.lines[0]).not.toHaveProperty('emoji');
  });

  it('sums sodium when both entries know it and leaves it unknown when one lacks it (D-16.20, R02.9)', () => {
    const soup = entryOf({ nutrients: { sodium: 800, fibre: 4 }, extras: { creatine: 1 } });
    const bread = entryOf({ nutrients: { sodium: 300 }, extras: { creatine: 0.5, taurine: 0.2 } });
    const combined = combineEntries([soup, bread], WORDS);
    expect(combined?.nutrients).toEqual({ sodium: 1_100 });
    expect(combined?.nutrients.fibre).toBeUndefined();
    expect(combined?.extras).toEqual({ creatine: 1.5 });

    const unsalted = entryOf({ nutrients: { fibre: 2 } });
    expect(combineEntries([soup, unsalted], WORDS)?.nutrients).toEqual({ fibre: 6 });
    // A known zero is a known value.
    const plain = entryOf({ nutrients: { sodium: 0 } });
    expect(combineEntries([soup, plain], WORDS)?.nutrients).toEqual({ sodium: 800 });
  });

  it('adds a visible 0 g line for an unknown-weight entry and sums the known weights (R02.9)', () => {
    const salad = entryOf({ name: 'Salad', basis: { kind: 'grams', grams: 180 } });
    const bar = entryOf({ name: 'Protein bar', kcal: 210, basis: { kind: 'servings', count: 2 } });
    const combined = combineEntries([salad, bar], WORDS);
    expect(combined?.lines).toHaveLength(2);
    expect(combined?.lines[1]).toMatchObject({ name: 'Protein bar', grams: 0, kcal: 210 });
    expect(combined?.basis).toEqual({ kind: 'grams', grams: 180 });
    expect(combined?.kcal).toBe(310);
  });

  it('falls back to one serving when no entry has a known weight', () => {
    const a = entryOf({ basis: { kind: 'servings', count: 1 } });
    const b = entryOf({ basis: { kind: 'servings', count: 3 } });
    expect(combineEntries([a, b], WORDS)?.basis).toEqual({ kind: 'servings', count: 1 });
  });

  it('carries no notes, product details, units or chosen unit', () => {
    const scanned = entryOf({
      note: 'from the corner shop',
      product: { barcode: '4006381333931', allergens: [], traces: [], labels: [], categories: [] },
      units: [{ unit: 'bar', gramsEach: 50, count: 2 }],
      chosenUnit: 'bar',
      chosenCount: 2,
      progressive: true,
    });
    const combined = combineEntries([scanned, entryOf()], WORDS);
    expect(combined).not.toHaveProperty('note');
    expect(combined).not.toHaveProperty('product');
    expect(combined).not.toHaveProperty('chosenUnit');
    expect(combined).not.toHaveProperty('chosenCount');
    expect(combined?.units).toEqual([]);
    expect(combined?.progressive).toBe(false);
  });

  it('names four entries "A + B + 2 more" and uses the caller name when none has a name', () => {
    expect(combineEntries(named('A', 'B', 'C', 'D'), WORDS)?.name).toBe('A + B + 2 more');
    expect(combineEntries(named(' ', ''), WORDS)?.name).toBe('Mixed plate');
  });

  it('needs at least two entries', () => {
    expect(combineEntries([], WORDS)).toBeNull();
    expect(combineEntries([entryOf()], WORDS)).toBeNull();
  });
});

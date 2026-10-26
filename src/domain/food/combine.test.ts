import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../model';
import { combineEntries, combinedName, type CombineNames } from './combine';

const NAMES: CombineNames = { fallback: 'Mixed plate', more: (count) => `${count} more` };

let nextId = 0;
function entryOf(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  nextId += 1;
  return {
    id: `e${nextId}`,
    name: `Food ${nextId}`,
    kcal: 100,
    protein: 1,
    carbs: 2,
    fat: 3,
    nutrients: {},
    extras: {},
    basis: { kind: 'grams', grams: 100 },
    units: [],
    lines: [],
    progressive: false,
    loggedAt: 1_000,
    dayKey: '2026-10-26',
    meal: 'breakfast',
    source: 'photo',
    photoIds: [],
    ...overrides,
  };
}

describe('combinedName', () => {
  const named = (...names: string[]) => names.map((name) => ({ name }));

  it('joins two or three names with " + "', () => {
    expect(combinedName(named('A', 'B'), NAMES)).toBe('A + B');
    expect(combinedName(named('A', 'B', 'C'), NAMES)).toBe('A + B + C');
  });

  it('shortens four or more names to the first two and a count of the rest', () => {
    expect(combinedName(named('A', 'B', 'C', 'D'), NAMES)).toBe('A + B + 2 more');
    expect(combinedName(named('A', 'B', 'C', 'D', 'E', 'F'), NAMES)).toBe('A + B + 4 more');
  });

  it('trims names, skips blank ones, and uses the fallback when none is left', () => {
    expect(combinedName(named(' Eggs ', '  ', 'Toast'), NAMES)).toBe('Eggs + Toast');
    expect(combinedName(named('', ' '), NAMES)).toBe('Mixed plate');
  });
});

describe('combineEntries', () => {
  it('sums kcal and macros and takes time, day and meal from the latest entry', () => {
    const eggs = entryOf({ name: 'Eggs', kcal: 150, protein: 12.5, carbs: 1.1, fat: 10.2 });
    const toast = entryOf({
      name: 'Toast',
      kcal: 130,
      protein: 4.25,
      carbs: 22,
      fat: 1.5,
      loggedAt: 5_000,
      dayKey: '2026-10-27',
      meal: 'lunch',
      source: 'text',
    });
    const juice = entryOf({ name: 'Juice', kcal: 90, loggedAt: 3_000, meal: 'snack' });
    const combined = combineEntries([eggs, toast, juice], NAMES);

    expect(combined.name).toBe('Eggs + Toast + Juice');
    expect(combined.kcal).toBe(370);
    expect(combined.protein).toBeCloseTo(17.75, 10);
    expect(combined.carbs).toBeCloseTo(25.1, 10);
    expect(combined.fat).toBeCloseTo(14.7, 10);
    expect(combined.loggedAt).toBe(5_000);
    expect(combined.dayKey).toBe('2026-10-27');
    expect(combined.meal).toBe('lunch');
    expect(combined.source).toBe('manual');
    expect('id' in combined).toBe(false);
  });

  it('keeps the first entry when the latest time is shared', () => {
    const first = entryOf({ loggedAt: 9_000, meal: 'dinner' });
    const second = entryOf({ loggedAt: 9_000, meal: 'snack' });
    expect(combineEntries([first, second], NAMES).meal).toBe('dinner');
  });

  it('makes one line per entry, with 0 g for an unknown weight so the line stays visible (R02.9)', () => {
    const rice = entryOf({ name: 'Rice', basis: { kind: 'grams', grams: 180 }, emoji: '🍚' });
    const soup = entryOf({ name: 'Soup', kcal: 220, basis: { kind: 'servings', count: 2 } });
    const combined = combineEntries([rice, soup], NAMES);

    expect(combined.lines).toEqual([
      {
        name: 'Rice',
        grams: 180,
        kcal: 100,
        protein: 1,
        carbs: 2,
        fat: 3,
        photoIds: [],
        emoji: '🍚',
      },
      { name: 'Soup', grams: 0, kcal: 220, protein: 1, carbs: 2, fat: 3, photoIds: [] },
    ]);
    expect(combined.basis).toEqual({ kind: 'grams', grams: 180 });
  });

  it('weighs the sum of the known weights, and is one serving when no weight is known', () => {
    const known = combineEntries(
      [
        entryOf({ basis: { kind: 'grams', grams: 120 } }),
        entryOf({ basis: { kind: 'grams', grams: 80.5 } }),
      ],
      NAMES,
    );
    expect(known.basis).toEqual({ kind: 'grams', grams: 200.5 });

    const unknown = combineEntries(
      [
        entryOf({ basis: { kind: 'servings', count: 1 } }),
        entryOf({ basis: { kind: 'servings', count: 3 } }),
      ],
      NAMES,
    );
    expect(unknown.basis).toEqual({ kind: 'servings', count: 1 });
    expect(unknown.lines.map((line) => line.grams)).toEqual([0, 0]);
  });

  it('sums a nutrient when every entry knows it and keeps it unknown when one lacks it (D-16.20, R02.9)', () => {
    const a = entryOf({ nutrients: { sodium: 400, fibre: 3, iron: 1.2 }, extras: { creatine: 3 } });
    const b = entryOf({
      nutrients: { sodium: 250.5, fibre: 0 },
      extras: { creatine: 2, taurine: 1 },
    });
    const combined = combineEntries([a, b], NAMES);
    expect(combined.nutrients).toEqual({ fibre: 3, sodium: 650.5 });
    expect('iron' in combined.nutrients).toBe(false);
    expect(combined.extras).toEqual({ creatine: 5 });

    const c = entryOf({ nutrients: { fibre: 2 } });
    const three = combineEntries([a, b, c], NAMES);
    expect(three.nutrients).toEqual({ fibre: 5 });
    expect('sodium' in three.nutrients).toBe(false);
    expect(three.extras).toEqual({});
  });

  it('gathers photos in order without repeats, lines included, and keeps the first emoji', () => {
    const plate = entryOf({
      photoIds: ['p1', 'p2'],
      emoji: '',
      lines: [
        { name: 'Side', grams: 50, kcal: 40, protein: 0, carbs: 9, fat: 0, photoIds: ['p3', 'p1'] },
      ],
    });
    const drink = entryOf({ photoIds: ['p4', 'p2'], emoji: '🥤' });
    const dessert = entryOf({ photoIds: ['p5'], emoji: '🍰' });
    const combined = combineEntries([plate, drink, dessert], NAMES);

    expect(combined.photoIds).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(combined.lines.map((line) => line.photoIds)).toEqual([
      ['p1', 'p2', 'p3'],
      ['p4', 'p2'],
      ['p5'],
    ]);
    expect(combined.emoji).toBe('🥤');
    expect('emoji' in combined.lines[0]!).toBe(false);
  });

  it('leaves out notes, product info, units and the chosen unit of the originals', () => {
    const scanned = entryOf({
      note: 'with milk',
      product: { barcode: '0123', allergens: [], traces: [], labels: [], categories: [] },
      units: [{ unit: 'cup', gramsEach: 240 }],
      chosenUnit: 'cup',
      chosenCount: 1,
      progressive: true,
    });
    const combined = combineEntries([scanned, entryOf()], NAMES);
    expect(combined.units).toEqual([]);
    expect(combined.progressive).toBe(false);
    for (const key of ['note', 'product', 'chosenUnit', 'chosenCount', 'emoji'] as const) {
      expect(key in combined).toBe(false);
    }
  });

  it('refuses fewer than two entries', () => {
    expect(() => combineEntries([entryOf()], NAMES)).toThrow(RangeError);
    expect(() => combineEntries([], NAMES)).toThrow(RangeError);
  });
});

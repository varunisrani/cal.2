import { describe, expect, it } from 'vitest';
import type { DiaryEntry } from '../model';
import {
  FACTORY_NOW,
  makeDraft,
  makeEntry,
  makeLine,
  makeProduct,
  makeSavedMeal,
} from '../../test/factories';
import {
  foldName,
  matchesQuery,
  oftenEaten,
  recentEntries,
  reuseDraft,
  searchFoods,
  windowStart,
} from './reuse';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = FACTORY_NOW;

const names = (entries: readonly DiaryEntry[]) => entries.map((entry) => entry.name);

describe('recentEntries', () => {
  it('leaves out an entry from 31 days ago, and keeps one from exactly 30 × 24 h ago', () => {
    const entries = [
      makeEntry({ name: 'Too old', loggedAt: NOW - 31 * DAY }),
      makeEntry({ name: 'Just out', loggedAt: NOW - 30 * DAY - 1 }),
      makeEntry({ name: 'Edge', loggedAt: NOW - 30 * DAY }),
      makeEntry({ name: 'Today', loggedAt: NOW - HOUR }),
    ];
    expect(names(recentEntries(entries, NOW))).toEqual(['Today', 'Edge']);
    expect(windowStart(NOW, 30)).toBe(NOW - 30 * DAY);
  });

  it('lists newest first and keeps every entry of the same food', () => {
    const entries = [
      makeEntry({ id: 'a', name: 'Toast', loggedAt: NOW - 3 * DAY }),
      makeEntry({ id: 'b', name: 'Toast', loggedAt: NOW - DAY }),
      makeEntry({ id: 'c', name: 'Soup', loggedAt: NOW - 2 * DAY }),
    ];
    expect(recentEntries(entries, NOW).map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps entries after now, which the window has no end for', () => {
    const later = makeEntry({ name: 'Later today', loggedAt: NOW + HOUR });
    expect(names(recentEntries([later], NOW))).toEqual(['Later today']);
  });
});

describe('oftenEaten (R02.7)', () => {
  it('puts "Café latte" and "cafe latte " with 120 kcal together, the latest as template', () => {
    const older = makeEntry({
      id: 'older',
      name: 'Café latte',
      kcal: 120,
      loggedAt: NOW - 5 * DAY,
    });
    const latest = makeEntry({ id: 'latest', name: 'cafe latte ', kcal: 120, loggedAt: NOW - DAY });
    const groups = oftenEaten([older, latest], NOW);
    expect(groups).toEqual([{ key: 'cafe latte|120', template: latest, count: 2 }]);
  });

  it('keeps the same name with other kcal apart', () => {
    const groups = oftenEaten(
      [
        makeEntry({ name: 'Café latte', kcal: 120, loggedAt: NOW - DAY }),
        makeEntry({ name: 'Café latte', kcal: 121, loggedAt: NOW - 2 * DAY }),
      ],
      NOW,
    );
    expect(groups.map((group) => [group.key, group.count])).toEqual([
      ['cafe latte|120', 1],
      ['cafe latte|121', 1],
    ]);
  });

  it('looks back 90 × 24 h and no further', () => {
    const groups = oftenEaten(
      [
        makeEntry({ name: 'Soup', kcal: 300, loggedAt: NOW - 90 * DAY }),
        makeEntry({ name: 'Soup', kcal: 300, loggedAt: NOW - 91 * DAY }),
        makeEntry({ name: 'Stew', kcal: 500, loggedAt: NOW - 90 * DAY - 1 }),
      ],
      NOW,
    );
    expect(groups.map((group) => [group.template.name, group.count])).toEqual([['Soup', 1]]);
  });

  it('sorts by count, most first, then by name ignoring case and accents', () => {
    const at = (days: number) => NOW - days * DAY;
    const groups = oftenEaten(
      [
        makeEntry({ name: 'banana', kcal: 90, loggedAt: at(1) }),
        makeEntry({ name: 'Éclair', kcal: 260, loggedAt: at(2) }),
        makeEntry({ name: 'Apple', kcal: 80, loggedAt: at(3) }),
        makeEntry({ name: 'Rice', kcal: 200, loggedAt: at(4) }),
        makeEntry({ name: 'Rice', kcal: 200, loggedAt: at(5) }),
        makeEntry({ name: 'Rice', kcal: 200, loggedAt: at(6) }),
        makeEntry({ name: 'eclair', kcal: 260, loggedAt: at(7) }),
      ],
      NOW,
    );
    expect(groups.map((group) => [group.template.name, group.count])).toEqual([
      ['Rice', 3],
      ['Éclair', 2],
      ['Apple', 1],
      ['banana', 1],
    ]);
  });
});

describe('search', () => {
  it('finds "Café" for "cafe", and "cafe" for "CAFÉ" (ACC-D16-1)', () => {
    expect(matchesQuery('Café latte', 'cafe')).toBe(true);
    expect(matchesQuery('iced cafe', 'CAFÉ')).toBe(true);
    expect(matchesQuery('Crème brûlée', 'brulee')).toBe(true);
    expect(matchesQuery('Tea', 'cafe')).toBe(false);
  });

  it('trims the query, and a blank query matches everything', () => {
    expect(matchesQuery('Porridge with berries', '  berries  ')).toBe(true);
    expect(matchesQuery('Porridge', '   ')).toBe(true);
    const foods = [{ name: 'Café latte' }, { name: 'Toast' }, { name: 'Cafeteria salad' }];
    expect(searchFoods(foods, ' café', (food) => food.name)).toEqual([
      { name: 'Café latte' },
      { name: 'Cafeteria salad' },
    ]);
  });

  it('folds names the way the groups compare them', () => {
    expect(foldName('  Crème Brûlée ')).toBe('creme brulee');
    expect(foldName('İSTANBUL simit')).toBe('istanbul simit');
  });
});

describe('reuseDraft', () => {
  it("keeps a known weight's grams and units, and drops the diary's own fields", () => {
    const entry = makeEntry({
      id: 'entry-x',
      meal: 'dinner',
      source: 'barcode',
      photoIds: ['p1'],
      basis: { kind: 'grams', grams: 60 },
      units: [{ unit: 'slice', gramsEach: 30, count: 2 }],
      chosenUnit: 'slice',
      chosenCount: 2,
      note: 'with butter',
      emoji: '🍞',
      product: makeProduct(),
    });
    const draft = reuseDraft(entry);
    expect(draft).toEqual({
      ...makeDraft(),
      basis: { kind: 'grams', grams: 60 },
      units: [{ unit: 'slice', gramsEach: 30, count: 2 }],
      chosenUnit: 'slice',
      chosenCount: 2,
      note: 'with butter',
      emoji: '🍞',
      product: makeProduct(),
    });
    expect(draft).not.toHaveProperty('id');
    expect(draft).not.toHaveProperty('photoIds');
    expect(draft).not.toHaveProperty('meal');
  });

  it('keeps the price of a saved meal or an entry, and none when it had none (D-16.107)', () => {
    const meal = makeSavedMeal({ price: { amount: 120, currency: 'INR' } });
    const draft = reuseDraft(meal);
    expect(draft.price).toEqual({ amount: 120, currency: 'INR' });
    expect(draft.price).not.toBe(meal.price);
    expect(reuseDraft(makeEntry())).not.toHaveProperty('price');
  });

  it('keeps an unknown weight as servings, never inventing grams (R02.1)', () => {
    const meal = makeSavedMeal({ basis: { kind: 'servings', count: 2 }, units: [] });
    expect(reuseDraft(meal).basis).toEqual({ kind: 'servings', count: 2 });
    expect(reuseDraft(meal)).not.toHaveProperty('order');
  });

  it('copies lists, so editing the draft never reaches the entry', () => {
    const entry = makeEntry({ lines: [makeLine({ photoIds: ['l1'] })] });
    const draft = reuseDraft(entry);
    expect(draft.lines).toEqual(entry.lines);
    expect(draft.lines).not.toBe(entry.lines);
    expect(draft.nutrients).not.toBe(entry.nutrients);
  });
});

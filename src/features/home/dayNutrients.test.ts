import { describe, expect, it } from 'vitest';
import { EXTRA_KEYS, NUTRIENT_KEYS } from '../../domain/model';
import { PILLAR_KEYS } from '../../domain/nutrients/catalogue';
import { home } from '../../i18n/en/home';
import { makeEntry } from '../../test/factories';
import {
  amountIn,
  amountText,
  amountWithUnit,
  dayTotal,
  DETAIL_ORDER,
  nutrientName,
  PICKER_ORDER,
  shownTotal,
  shownWater,
  statusLine,
} from './dayNutrients';

const words = home.home;

describe('amountIn', () => {
  it('reads macros, optional nutrients and extras, and counts an unknown one as 0', () => {
    const entry = makeEntry({ protein: 12, nutrients: { sodium: 820 }, extras: { creatine: 5 } });
    expect(amountIn(entry, 'protein')).toBe(12);
    expect(amountIn(entry, 'sodium')).toBe(820);
    expect(amountIn(entry, 'creatine')).toBe(5);
    expect(amountIn(entry, 'fibre')).toBe(0);
    expect(amountIn(entry, 'taurine')).toBe(0);
  });
});

describe('dayTotal', () => {
  it('adds one nutrient over the day, counting entries that do not know it as 0', () => {
    const entries = [
      makeEntry({ nutrients: { vitaminD: 2.5 } }),
      makeEntry({ nutrients: {} }),
      makeEntry({ nutrients: { vitaminD: 4 } }),
    ];
    expect(dayTotal(entries, 'vitaminD')).toBe(6.5);
    expect(dayTotal([], 'protein')).toBe(0);
  });
});

describe('amountText', () => {
  it('writes one decimal only when the amount is not whole', () => {
    expect(amountText(shownTotal(158.25))).toBe('158.3');
    expect(amountText(shownTotal(159.96))).toBe('160');
    expect(amountText(2_500)).toBe('2,500');
    expect(amountText(0)).toBe('0');
    expect(amountWithUnit(8.5, 'flOz')).toBe('8.5 fl oz');
  });
});

describe('statusLine', () => {
  it('says what is left, how far over, reached or no goal, in the unit given', () => {
    expect(statusLine(2_500, 2_300, 'mg')).toBe('200 mg over');
    expect(statusLine(12.4, 20, 'mcg')).toBe('7.6 mcg left');
    expect(statusLine(61.5, 61.5, 'g')).toBe(words.pillar.reached);
    expect(statusLine(3, 0, 'g')).toBe(words.pillar.noGoal);
    expect(statusLine(500, 2_000, 'ml')).toBe('1,500 ml left');
    expect(statusLine(70, 67.6, 'flOz')).toBe('2.4 fl oz over');
  });

  it('compares the shown amounts, so a sum of decimals meets its goal', () => {
    expect(statusLine(shownTotal(0.1 + 0.2), 0.3, 'g')).toBe(words.pillar.reached);
  });
});

describe('shownWater', () => {
  it('shows whole ml, and fl oz whole or to one decimal', () => {
    expect(shownWater({ totalMl: 750, goalMl: 2_000, unit: 'ml' })).toEqual({
      total: 750,
      goal: 2_000,
    });
    expect(shownWater({ totalMl: 250, goalMl: 2_000, unit: 'flOz' })).toEqual({
      total: 8.5,
      goal: 67.6,
    });
  });
});

describe('the nutrient lists', () => {
  it('lists the 23 optional nutrients, then the 8 sports compounds, each once, in the sheet', () => {
    expect(DETAIL_ORDER).toHaveLength(31);
    expect([...DETAIL_ORDER.slice(0, 23)].sort()).toEqual([...NUTRIENT_KEYS].sort());
    expect([...DETAIL_ORDER.slice(23)].sort()).toEqual([...EXTRA_KEYS].sort());
  });

  it('offers the macros, then every other pillar nutrient, each once, in the picker', () => {
    expect(PICKER_ORDER).toHaveLength(32);
    expect(PICKER_ORDER.slice(0, 3)).toEqual(['protein', 'carbs', 'fat']);
    expect([...PICKER_ORDER].sort()).toEqual([...PILLAR_KEYS].sort());
  });

  it('names every nutrient, the two goal-less fats included', () => {
    for (const id of [...PILLAR_KEYS, 'monounsaturatedFat', 'polyunsaturatedFat'] as const) {
      expect(nutrientName(id)).toMatch(/\S/);
    }
    expect(nutrientName('vitaminB12')).toBe(words.pillar.vitaminB12);
    expect(nutrientName('polyunsaturatedFat')).toBe(words.nutrients.polyunsaturatedFat);
  });
});

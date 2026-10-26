import { describe, expect, it } from 'vitest';
import {
  amountText,
  amountToMl,
  decodeQuickAdd,
  DEFAULT_QUICK_ADD_ML,
  DEFAULT_WATER_GOAL_ML,
  DEFAULT_WATER_UNIT,
  filterAmountText,
  formatWater,
  isWaterDisplayUnit,
  maxAmountShown,
  ML_PER_FL_OZ,
  parseAmountText,
  quickAddFieldMl,
  quickAddFromFields,
  WATER_GOAL_WHEEL,
  waterGoalSave,
  waterGoalStart,
  waterShown,
  waterToDisplay,
} from './water';

/** The ml whose fl oz value is `ounces`, unrounded. */
const mlOf = (ounces: number): number => ounces * ML_PER_FL_OZ;

describe('water units', () => {
  it('defaults to ml, a 2 000 ml goal and 250 / 500 / 750 quick-add amounts', () => {
    expect(DEFAULT_WATER_UNIT).toBe('ml');
    expect(DEFAULT_WATER_GOAL_ML).toBe(2_000);
    expect(DEFAULT_QUICK_ADD_ML).toEqual([250, 500, 750]);
  });

  it('guards the two unit values', () => {
    expect(isWaterDisplayUnit('ml')).toBe(true);
    expect(isWaterDisplayUnit('flOz')).toBe(true);
    for (const value of ['floz', 'fl oz', 'ML', '', null]) {
      expect(isWaterDisplayUnit(value)).toBe(false);
    }
  });

  it('converts with 1 fl oz = 29.5735295625 ml', () => {
    expect(waterToDisplay(ML_PER_FL_OZ, 'flOz')).toBe(1);
    expect(waterToDisplay(250, 'ml')).toBe(250);
  });
});

describe('waterShown', () => {
  it('shows fl oz as a whole number within 0.05 of one, else with one decimal', () => {
    expect(waterShown(237, 'flOz')).toBe(8);
    expect(waterShown(250, 'flOz')).toBe(8.5);
    expect(waterShown(mlOf(8.04), 'flOz')).toBe(8);
    expect(waterShown(mlOf(8.06), 'flOz')).toBe(8.1);
    expect(waterShown(mlOf(8.96), 'flOz')).toBe(9);
    expect(waterShown(mlOf(8.94), 'flOz')).toBe(8.9);
  });

  it('shows whole ml', () => {
    expect(waterShown(250, 'ml')).toBe(250);
  });
});

describe('formatWater', () => {
  it('writes ml as a grouped whole number and fl oz with at most one decimal', () => {
    expect(formatWater(1_000, 'ml', 'en-US')).toBe('1,000');
    expect(formatWater(1_000, 'ml', 'de-DE')).toBe('1.000');
    expect(formatWater(237, 'flOz', 'en-US')).toBe('8');
    expect(formatWater(250, 'flOz', 'en-US')).toBe('8.5');
    expect(formatWater(250, 'flOz', 'de-DE')).toBe('8,5');
  });
});

describe('goal wheel', () => {
  it('spans 50–10 000 ml in 50s or 2–338 fl oz in 1s', () => {
    expect(WATER_GOAL_WHEEL.ml).toEqual({ min: 50, max: 10_000, step: 50 });
    expect(WATER_GOAL_WHEEL.flOz).toEqual({ min: 2, max: 338, step: 1 });
  });

  it('opens on the stored goal rounded to the nearest step', () => {
    expect(waterGoalStart(2_000, 'ml')).toBe(2_000);
    expect(waterGoalStart(2_025, 'ml')).toBe(2_050);
    expect(waterGoalStart(2_020, 'ml')).toBe(2_000);
    expect(waterGoalStart(2_000, 'flOz')).toBe(68);
  });

  it('keeps the opening value inside the range', () => {
    expect(waterGoalStart(30, 'ml')).toBe(50);
    expect(waterGoalStart(20_000, 'ml')).toBe(10_000);
    expect(waterGoalStart(10, 'flOz')).toBe(2);
    expect(waterGoalStart(20_000, 'flOz')).toBe(338);
  });

  it('keeps the exact stored ml when the fl oz wheel was not moved', () => {
    const start = waterGoalStart(2_000, 'flOz');
    expect(waterGoalSave(start, start, 2_000, 'flOz')).toBe(2_000);
  });

  it('converts a moved fl oz wheel and stores what the ml wheel shows', () => {
    expect(waterGoalSave(68, 67, 1_990, 'flOz')).toBe(2_011);
    expect(waterGoalSave(2_050, 2_050, 2_025, 'ml')).toBe(2_050);
    expect(waterGoalSave(3_000, 2_000, 2_000, 'ml')).toBe(3_000);
  });
});

describe('decodeQuickAdd', () => {
  it('reads three amounts and keeps them smallest first', () => {
    expect(decodeQuickAdd([500, 250, 750])).toEqual([250, 500, 750]);
    expect(decodeQuickAdd([330, 200, 200])).toEqual([200, 200, 330]);
    expect(decodeQuickAdd([1, 5_000, 2_500])).toEqual([1, 2_500, 5_000]);
  });

  it('falls back to 250 / 500 / 750 for anything that is not three amounts of 1–5 000 ml', () => {
    const bad: unknown[] = [
      undefined,
      null,
      '',
      'garbage',
      '250,500,750',
      {},
      [],
      [250, 500],
      [250, 500, 750, 1_000],
      [0, 500, 750],
      [250, 500, 5_001],
      [250, 500.5, 750],
      [250, '500', 750],
      [250, null, 750],
      [250, Number.NaN, 750],
      [-250, 500, 750],
    ];
    for (const value of bad) {
      expect(decodeQuickAdd(value), JSON.stringify(value)).toEqual([250, 500, 750]);
    }
  });

  it('returns a new array every time', () => {
    const first = decodeQuickAdd(null);
    first.push(1);
    expect(decodeQuickAdd(null)).toEqual([250, 500, 750]);
    const stored = [750, 500, 250];
    decodeQuickAdd(stored);
    expect(stored).toEqual([750, 500, 250]);
  });
});

describe('amountToMl', () => {
  it('converts to whole ml', () => {
    expect(amountToMl(8, 'flOz')).toBe(237);
    expect(amountToMl(8.5, 'flOz')).toBe(251);
    expect(amountToMl(0.1, 'flOz')).toBe(3);
    expect(amountToMl(200, 'ml')).toBe(200);
  });

  it('raises a tiny amount to 1 ml', () => {
    expect(amountToMl(0.4, 'ml')).toBe(1);
  });

  it('caps a custom amount at 5 000 ml (R05.10, D-16.39)', () => {
    expect(amountToMl(5_000, 'ml')).toBe(5_000);
    expect(amountToMl(5_001, 'ml')).toBeNull();
    expect(amountToMl(6_000, 'ml')).toBeNull();
    expect(amountToMl(99_999, 'ml')).toBeNull();
    expect(amountToMl(170, 'flOz')).toBeNull();
    expect(amountToMl(169, 'flOz')).toBe(4_998);
  });

  it('refuses zero, negative and non-finite amounts', () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(amountToMl(value, 'ml')).toBeNull();
    }
  });

  it('names a maximum the field itself accepts', () => {
    expect(maxAmountShown('ml')).toBe(5_000);
    expect(maxAmountShown('flOz')).toBe(169);
    expect(amountToMl(maxAmountShown('flOz'), 'flOz')).not.toBeNull();
    expect(amountToMl(maxAmountShown('flOz') + 0.1, 'flOz')).toBeNull();
  });
});

describe('filterAmountText', () => {
  it('keeps at most five digits for ml', () => {
    expect(filterAmountText('2a5.0', 'ml', 'en-US')).toBe('250');
    expect(filterAmountText('123456', 'ml', 'en-US')).toBe('12345');
    expect(filterAmountText('1,5', 'ml', 'de-DE')).toBe('15');
  });

  it('keeps one decimal place for fl oz, written with the locale mark', () => {
    expect(filterAmountText('8,57', 'flOz', 'en-US')).toBe('8.5');
    expect(filterAmountText('8.5', 'flOz', 'de-DE')).toBe('8,5');
    expect(filterAmountText('8,5', 'flOz', 'de-DE')).toBe('8,5');
    expect(filterAmountText('8.5.3', 'flOz', 'en-US')).toBe('8.5');
    expect(filterAmountText('a1b2', 'flOz', 'en-US')).toBe('12');
    expect(filterAmountText('.5', 'flOz', 'en-US')).toBe('.5');
  });

  it('keeps at most six characters for fl oz', () => {
    expect(filterAmountText('1234567', 'flOz', 'en-US')).toBe('123456');
    expect(filterAmountText('1234.5', 'flOz', 'en-US')).toBe('1234.5');
  });
});

describe('amountText', () => {
  it('seeds ml fields with plain digits', () => {
    expect(amountText(1_000, 'ml', 'en-US')).toBe('1000');
  });

  it('seeds fl oz fields with the shown value and the locale mark', () => {
    expect(amountText(237, 'flOz', 'en-US')).toBe('8');
    expect(amountText(250, 'flOz', 'en-US')).toBe('8.5');
    expect(amountText(250, 'flOz', 'de-DE')).toBe('8,5');
  });
});

describe('parseAmountText', () => {
  it('reads fl oz with a comma or a dot', () => {
    expect(parseAmountText('8', 'flOz', 'en-US')).toBe(237);
    expect(parseAmountText('8,5', 'flOz', 'en-US')).toBe(251);
    expect(parseAmountText('8.5', 'flOz', 'en-US')).toBe(251);
    expect(parseAmountText('8,5', 'flOz', 'de-DE')).toBe(251);
  });

  it('refuses empty, zero and over-the-limit fields', () => {
    expect(parseAmountText('170', 'flOz', 'en-US')).toBeNull();
    expect(parseAmountText('', 'ml', 'en-US')).toBeNull();
    expect(parseAmountText('0', 'ml', 'en-US')).toBeNull();
    expect(parseAmountText('0.0', 'flOz', 'en-US')).toBeNull();
    expect(parseAmountText('5001', 'ml', 'en-US')).toBeNull();
    expect(parseAmountText('200', 'ml', 'en-US')).toBe(200);
  });
});

describe('quickAddFieldMl', () => {
  it('keeps the stored ml of a field still showing its seeded text', () => {
    expect(quickAddFieldMl('8.5', 250, 'flOz', 'en-US')).toBe(250);
    expect(quickAddFieldMl('8,5', 250, 'flOz', 'de-DE')).toBe(250);
  });

  it('reads an edited field', () => {
    expect(quickAddFieldMl('8', 250, 'flOz', 'en-US')).toBe(237);
    expect(quickAddFieldMl('', 250, 'flOz', 'en-US')).toBeNull();
  });
});

describe('quickAddFromFields', () => {
  const saved = [250, 500, 750];
  const seeded = (unit: 'ml' | 'flOz', locale: string): string[] =>
    saved.map((ml) => amountText(ml, unit, locale));

  it('keeps the exact ml of a field left untouched in fl oz (R05.10)', () => {
    expect(seeded('flOz', 'en-US')).toEqual(['8.5', '16.9', '25.4']);
    expect(quickAddFromFields(seeded('flOz', 'en-US'), saved, 'flOz', 'en-US')).toEqual(saved);
    expect(quickAddFromFields(seeded('flOz', 'de-DE'), saved, 'flOz', 'de-DE')).toEqual(saved);
    // Read back through fl oz, 250 ml would have become 251.
    expect(parseAmountText('8.5', 'flOz', 'en-US')).toBe(251);
  });

  it('converts only the fields that were edited', () => {
    const texts = ['8', ...seeded('flOz', 'en-US').slice(1)];
    expect(quickAddFromFields(texts, saved, 'flOz', 'en-US')).toEqual([237, 500, 750]);
  });

  it('stores the amounts smallest first', () => {
    expect(quickAddFromFields(['900', '500', '750'], saved, 'ml', 'en-US')).toEqual([
      500, 750, 900,
    ]);
  });

  it('saves nothing while a field is empty, zero or over the limit', () => {
    expect(quickAddFromFields(['', '500', '750'], saved, 'ml', 'en-US')).toBeNull();
    expect(quickAddFromFields(['250', '0', '750'], saved, 'ml', 'en-US')).toBeNull();
    expect(quickAddFromFields(['250', '500', '5001'], saved, 'ml', 'en-US')).toBeNull();
    expect(quickAddFromFields(['300', '500', '750'], saved, 'ml', 'en-US')).toEqual([
      300, 500, 750,
    ]);
  });

  it('needs exactly three fields and three stored amounts', () => {
    expect(quickAddFromFields([], saved, 'ml', 'en-US')).toBeNull();
    expect(quickAddFromFields(['250', '500'], saved, 'ml', 'en-US')).toBeNull();
    expect(quickAddFromFields(['250', '500', '750'], [250, 500], 'ml', 'en-US')).toBeNull();
  });
});

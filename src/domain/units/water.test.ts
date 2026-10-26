import { describe, expect, it } from 'vitest';
import {
  ML_PER_FL_OZ,
  QUICK_ADD_DEFAULTS,
  WATER_GOAL_WHEEL,
  decodeQuickAdd,
  filterWaterField,
  formatWater,
  isWaterMeasure,
  parseWaterField,
  quickAddFieldMl,
  quickAddFromFields,
  sortQuickAdd,
  waterAmountMl,
  waterDisplayValue,
  waterFieldText,
  waterGoalSave,
  waterGoalStart,
  type QuickAddField,
} from './water';

describe('isWaterMeasure', () => {
  it('accepts the setting values and nothing else', () => {
    expect(isWaterMeasure('ml')).toBe(true);
    expect(isWaterMeasure('flOz')).toBe(true);
    for (const value of ['floz', 'fl oz', 'ML', '', null, 1]) {
      expect(isWaterMeasure(value)).toBe(false);
    }
  });
});

describe('waterDisplayValue', () => {
  it('shows fl oz whole within 0.05 of a whole number, else with one decimal', () => {
    expect(ML_PER_FL_OZ).toBe(29.5735295625);
    expect(waterDisplayValue(237, 'flOz')).toBe(8);
    expect(waterDisplayValue(250, 'flOz')).toBe(8.5);
    expect(waterDisplayValue(500, 'flOz')).toBe(16.9);
    // 7.96 fl oz is 0.04 from 8.
    expect(waterDisplayValue(7.96 * ML_PER_FL_OZ, 'flOz')).toBe(8);
    expect(waterDisplayValue(7.94 * ML_PER_FL_OZ, 'flOz')).toBe(7.9);
  });

  it('shows whole ml', () => {
    expect(waterDisplayValue(250, 'ml')).toBe(250);
    expect(waterDisplayValue(1000, 'ml')).toBe(1000);
  });
});

describe('formatWater', () => {
  it('groups ml the locale way', () => {
    expect(formatWater(1000, 'ml', 'en-US')).toBe('1,000');
    expect(formatWater(1000, 'ml', 'de-DE')).toBe('1.000');
    expect(formatWater(250, 'ml', 'en-US')).toBe('250');
  });

  it('writes fl oz whole or with one decimal in the locale marks', () => {
    expect(formatWater(237, 'flOz', 'en-US')).toBe('8');
    expect(formatWater(250, 'flOz', 'en-US')).toBe('8.5');
    expect(formatWater(250, 'flOz', 'de-DE')).toBe('8,5');
  });
});

describe('waterAmountMl', () => {
  it('converts to whole ml', () => {
    expect(waterAmountMl(8, 'flOz')).toBe(237);
    expect(waterAmountMl(8.5, 'flOz')).toBe(251);
    expect(waterAmountMl(330, 'ml')).toBe(330);
  });

  it('caps a custom amount at 5 000 ml (R05.10, D-16.39)', () => {
    expect(waterAmountMl(6000, 'ml')).toBeNull();
    expect(waterAmountMl(5001, 'ml')).toBeNull();
    expect(waterAmountMl(5000, 'ml')).toBe(5000);
    expect(waterAmountMl(169, 'flOz')).toBe(4998);
    // 169.1 fl oz is 5 000.9 ml, which rounds to 5 001.
    expect(waterAmountMl(169.1, 'flOz')).toBeNull();
    expect(waterAmountMl(99_999, 'ml')).toBeNull();
  });

  it('gives at least 1 ml for any amount above zero', () => {
    expect(waterAmountMl(0.4, 'ml')).toBe(1);
    expect(waterAmountMl(0.01, 'flOz')).toBe(1);
  });

  it('refuses zero, negative and non-finite amounts', () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(waterAmountMl(value, 'ml')).toBeNull();
    }
  });
});

describe('water goal wheel', () => {
  it('runs 50–10 000 ml in steps of 50 or 2–338 fl oz in steps of 1', () => {
    expect(WATER_GOAL_WHEEL).toEqual({
      ml: { min: 50, max: 10_000, step: 50 },
      flOz: { min: 2, max: 338, step: 1 },
    });
  });

  it('opens on the stored goal rounded to the nearest step', () => {
    expect(waterGoalStart(2000, 'ml')).toBe(2000);
    expect(waterGoalStart(2030, 'ml')).toBe(2050);
    expect(waterGoalStart(2020, 'ml')).toBe(2000);
    expect(waterGoalStart(2000, 'flOz')).toBe(68);
    expect(waterGoalStart(237, 'flOz')).toBe(8);
  });

  it('keeps the opening position inside the wheel', () => {
    expect(waterGoalStart(10, 'ml')).toBe(50);
    expect(waterGoalStart(20_000, 'ml')).toBe(10_000);
    expect(waterGoalStart(30, 'flOz')).toBe(2);
    expect(waterGoalStart(20_000, 'flOz')).toBe(338);
  });

  it('keeps the stored goal when the wheel was not moved', () => {
    const opened = waterGoalStart(2000, 'flOz');
    expect(waterGoalSave(opened, opened, 2000, 'flOz')).toBe(2000);
    expect(waterGoalSave(2050, 2050, 2030, 'ml')).toBe(2030);
  });

  it('converts a moved wheel to whole ml', () => {
    expect(waterGoalSave(64, 68, 2000, 'flOz')).toBe(1893);
    expect(waterGoalSave(2500, 2000, 2000, 'ml')).toBe(2500);
  });
});

describe('decodeQuickAdd', () => {
  it('returns three valid amounts smallest first', () => {
    expect(decodeQuickAdd([500, 250, 750])).toEqual([250, 500, 750]);
    expect(decodeQuickAdd([750, 200, 500])).toEqual([200, 500, 750]);
    expect(decodeQuickAdd([330, 200, 200])).toEqual([200, 200, 330]);
    expect(decodeQuickAdd([1, 5000, 2500])).toEqual([1, 2500, 5000]);
  });

  it('falls back to 250, 500 and 750 for anything else', () => {
    for (const raw of [
      undefined,
      null,
      '',
      'garbage',
      '250,500,750',
      {},
      [],
      [250, 500],
      [250, 500, 750, 1000],
      [0, 500, 750],
      [250, 500, 5001],
      [250.5, 500, 750],
      [250, '500', 750],
      [250, null, 750],
      [250, Number.NaN, 750],
    ]) {
      expect(decodeQuickAdd(raw), JSON.stringify(raw)).toEqual([250, 500, 750]);
    }
    expect(QUICK_ADD_DEFAULTS).toEqual([250, 500, 750]);
  });

  it('never changes the array it reads', () => {
    const stored = [500, 250, 750];
    decodeQuickAdd(stored);
    expect(stored).toEqual([500, 250, 750]);
  });
});

describe('sortQuickAdd', () => {
  it('puts the amounts in storage order', () => {
    expect(sortQuickAdd([750, 200, 500])).toEqual([200, 500, 750]);
  });
});

describe('filterWaterField', () => {
  it('keeps up to five digits for ml', () => {
    expect(filterWaterField('2a5.0', 'ml')).toBe('250');
    expect(filterWaterField('1,000', 'ml')).toBe('1000');
    expect(filterWaterField('123456', 'ml')).toBe('12345');
  });

  it('keeps digits, one decimal mark and one decimal place for fl oz', () => {
    expect(filterWaterField('8,57', 'flOz')).toBe('8,5');
    expect(filterWaterField('8.5.7', 'flOz')).toBe('8.5');
    expect(filterWaterField('12oz', 'flOz')).toBe('12');
    expect(filterWaterField('1234.56', 'flOz')).toBe('1234.5');
    expect(filterWaterField('1234567', 'flOz')).toBe('123456');
  });
});

describe('waterFieldText', () => {
  it('opens with plain digits in the current unit', () => {
    expect(waterFieldText(1000, 'ml')).toBe('1000');
    expect(waterFieldText(237, 'flOz')).toBe('8');
    expect(waterFieldText(250, 'flOz')).toBe('8.5');
  });
});

describe('parseWaterField', () => {
  it('converts the typed amount to ml', () => {
    expect(parseWaterField('200', 'ml')).toBe(200);
    expect(parseWaterField('8', 'flOz')).toBe(237);
    expect(parseWaterField('8,5', 'flOz')).toBe(251);
    expect(parseWaterField('8.5', 'flOz')).toBe(251);
  });

  it('refuses empty, zero and amounts above 5 000 ml', () => {
    expect(parseWaterField('', 'ml')).toBeNull();
    expect(parseWaterField('0', 'ml')).toBeNull();
    expect(parseWaterField('0,0', 'flOz')).toBeNull();
    expect(parseWaterField('5001', 'ml')).toBeNull();
    expect(parseWaterField('6000', 'ml')).toBeNull();
    expect(parseWaterField('170', 'flOz')).toBeNull();
    expect(parseWaterField('5000', 'ml')).toBe(5000);
  });
});

describe('quick-add editor', () => {
  const saved = [250, 500, 750] as const;

  function fieldsFor(unit: 'ml' | 'flOz', texts?: readonly string[]): QuickAddField[] {
    return saved.map((ml, index) => {
      const savedText = waterFieldText(ml, unit);
      return { text: texts?.[index] ?? savedText, savedText, savedMl: ml };
    });
  }

  it('keeps the exact stored ml of a fl oz field that was not touched (R05.10)', () => {
    const fields = fieldsFor('flOz');
    expect(fields.map((field) => field.text)).toEqual(['8.5', '16.9', '25.4']);
    // Read back from its text, "8.5" fl oz would be 251 ml.
    expect(parseWaterField('8.5', 'flOz')).toBe(251);
    expect(quickAddFieldMl(fields[0] as QuickAddField, 'flOz')).toBe(250);
    expect(quickAddFromFields(fields, 'flOz')).toEqual([250, 500, 750]);
  });

  it('converts only the fields that changed', () => {
    expect(quickAddFromFields(fieldsFor('flOz', ['8']), 'flOz')).toEqual([237, 500, 750]);
    expect(quickAddFromFields(fieldsFor('ml', ['300']), 'ml')).toEqual([300, 500, 750]);
  });

  it('saves the amounts smallest first', () => {
    expect(quickAddFromFields(fieldsFor('ml', ['900']), 'ml')).toEqual([500, 750, 900]);
  });

  it('saves nothing while any field is empty, zero or above 5 000 ml', () => {
    expect(quickAddFromFields(fieldsFor('ml', ['']), 'ml')).toBeNull();
    expect(quickAddFromFields(fieldsFor('ml', ['250', '0']), 'ml')).toBeNull();
    expect(quickAddFromFields(fieldsFor('ml', ['250', '500', '5001']), 'ml')).toBeNull();
    expect(quickAddFromFields(fieldsFor('flOz', ['170']), 'flOz')).toBeNull();
    const fields = fieldsFor('flOz', ['8', '']);
    expect(fields.map((field) => quickAddFieldMl(field, 'flOz'))).toEqual([237, null, 750]);
  });

  it('needs exactly three fields', () => {
    expect(quickAddFromFields([], 'ml')).toBeNull();
    expect(quickAddFromFields(fieldsFor('ml').slice(0, 2), 'ml')).toBeNull();
  });
});

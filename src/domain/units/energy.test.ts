import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENERGY_UNIT,
  ENERGY_GOAL_WHEEL,
  formatEnergy,
  fromDisplay,
  isEnergyDisplayUnit,
  parseEnergy,
  pickerSave,
  pickerStart,
  toDisplay,
  toDisplayUnrounded,
  typedKcal,
} from './energy';

describe('energy units', () => {
  it('defaults to kcal and guards the two unit values', () => {
    expect(DEFAULT_ENERGY_UNIT).toBe('kcal');
    expect(isEnergyDisplayUnit('kcal')).toBe(true);
    expect(isEnergyDisplayUnit('kJ')).toBe(true);
    for (const value of ['kj', 'KJ', 'Kcal', '', null, undefined, 4.184]) {
      expect(isEnergyDisplayUnit(value)).toBe(false);
    }
  });
});

describe('toDisplay', () => {
  it('converts kcal to whole kJ', () => {
    expect(toDisplay(0, 'kJ')).toBe(0);
    expect(toDisplay(1, 'kJ')).toBe(4);
    expect(toDisplay(100, 'kJ')).toBe(418);
    expect(toDisplay(2_000, 'kJ')).toBe(8_368);
  });

  it('leaves whole kcal unchanged in kcal', () => {
    expect(toDisplay(1_234, 'kcal')).toBe(1_234);
    expect(toDisplay(1_234.6, 'kcal')).toBe(1_235);
  });

  it('gives the unrounded amount for charts and averages', () => {
    expect(toDisplayUnrounded(250, 'kJ')).toBeCloseTo(1_046, 10);
    expect(toDisplayUnrounded(1.5, 'kcal')).toBe(1.5);
  });
});

describe('fromDisplay', () => {
  it('converts typed kJ back to whole kcal', () => {
    expect(fromDisplay(8_368, 'kJ')).toBe(2_000);
    expect(fromDisplay(418, 'kJ')).toBe(100);
    expect(fromDisplay(4.184, 'kJ')).toBe(1);
    expect(fromDisplay(1_234, 'kcal')).toBe(1_234);
  });

  it('returns every whole kcal from 0 to 10 000 unchanged after a trip through kJ', () => {
    for (let kcal = 0; kcal <= 10_000; kcal += 1) {
      const back = fromDisplay(toDisplay(kcal, 'kJ'), 'kJ');
      if (back !== kcal) expect.fail(`${kcal} kcal came back as ${back}`);
    }
  });
});

describe('formatEnergy', () => {
  it('writes the display value grouped in the locale', () => {
    expect(formatEnergy(2_000, 'kJ', 'en-US')).toBe('8,368');
    expect(formatEnergy(2_000, 'kJ', 'de-DE')).toBe('8.368');
    expect(formatEnergy(1_234, 'kcal', 'en-US')).toBe('1,234');
  });

  it('writes text that parseEnergy reads back', () => {
    for (const locale of ['en-US', 'de-DE', 'fr-FR', 'de-CH', 'en-IN']) {
      expect(parseEnergy(formatEnergy(123_456, 'kJ', locale), locale)).toBe(516_540);
    }
  });
});

describe('parseEnergy', () => {
  it("accepts the locale's grouping and decimal marks", () => {
    expect(parseEnergy('8368', 'en-US')).toBe(8_368);
    expect(parseEnergy('8,368', 'en-US')).toBe(8_368);
    expect(parseEnergy(' 8368.4 ', 'en-US')).toBe(8_368.4);
    expect(parseEnergy('8.368', 'de-DE')).toBe(8_368);
    expect(parseEnergy('418,4', 'de-DE')).toBe(418.4);
    expect(parseEnergy('0', 'en-US')).toBe(0);
  });

  it('falls back to a comma as the decimal mark', () => {
    expect(parseEnergy('418,4', 'en-US')).toBe(418.4);
  });

  it('refuses empty, non-numeric, trailing junk, negative and non-finite text', () => {
    for (const text of ['', '   ', 'abc', '12abc', '-5', '-50', 'Infinity', 'NaN', '1e3']) {
      expect(parseEnergy(text, 'en-US'), text).toBeNull();
    }
  });
});

describe('typedKcal', () => {
  it('reads a field and converts it to the kcal to store', () => {
    expect(typedKcal('8,368', 'kJ', 'en-US')).toBe(2_000);
    expect(typedKcal(' 8368.4 ', 'kJ', 'en-US')).toBe(2_000);
    expect(typedKcal('8.368', 'kJ', 'de-DE')).toBe(2_000);
    expect(typedKcal('418,4', 'kJ', 'de-DE')).toBe(100);
    expect(typedKcal('1200', 'kcal', 'en-US')).toBe(1_200);
    expect(typedKcal('-50', 'kJ', 'en-US')).toBeNull();
    expect(typedKcal('', 'kcal', 'en-US')).toBeNull();
  });
});

describe('goal wheel', () => {
  it('spans 800–6 000 kcal in 50s or 3 400–25 100 kJ in 100s', () => {
    expect(ENERGY_GOAL_WHEEL.kcal).toEqual({ min: 800, max: 6_000, step: 50 });
    expect(ENERGY_GOAL_WHEEL.kJ).toEqual({ min: 3_400, max: 25_100, step: 100 });
  });

  it('keeps the kJ range inside the kcal range', () => {
    const { min, max, step } = ENERGY_GOAL_WHEEL.kJ;
    expect(fromDisplay(min, 'kJ')).toBeGreaterThanOrEqual(800);
    expect(fromDisplay(max, 'kJ')).toBeLessThanOrEqual(6_000);
    expect(min % step).toBe(0);
    expect(max % step).toBe(0);
  });
});

describe('pickerStart', () => {
  it('opens on the shown goal snapped down to a step', () => {
    expect(pickerStart(2_000, 'kJ')).toBe(8_300);
    expect(pickerStart(2_000, 'kcal')).toBe(2_000);
    expect(pickerStart(2_037, 'kcal')).toBe(2_000);
  });

  it('keeps the opening value inside the range', () => {
    expect(pickerStart(790, 'kcal')).toBe(800);
    expect(pickerStart(100, 'kJ')).toBe(3_400);
    expect(pickerStart(9_000, 'kcal')).toBe(6_000);
    expect(pickerStart(9_000, 'kJ')).toBe(25_100);
  });
});

describe('pickerSave', () => {
  it('keeps the exact stored kcal when the kJ wheel was not moved (R06.20)', () => {
    expect(pickerSave(8_300, pickerStart(2_000, 'kJ'), 2_000, 'kJ')).toBe(2_000);
    expect(pickerSave(8_300, pickerStart(1_999, 'kJ'), 1_999, 'kJ')).toBe(1_999);
    // Opening and saving again and again never moves the goal.
    let goal = 2_345;
    for (let round = 0; round < 5; round += 1) {
      const start = pickerStart(goal, 'kJ');
      goal = pickerSave(start, start, goal, 'kJ');
    }
    expect(goal).toBe(2_345);
  });

  it('converts a kJ pick that differs from the opening value', () => {
    expect(pickerSave(8_400, 8_300, 2_000, 'kJ')).toBe(2_008);
    expect(pickerSave(8_200, 8_300, 2_000, 'kJ')).toBe(1_960);
  });

  it('stores what the kcal wheel shows', () => {
    expect(pickerSave(2_000, pickerStart(2_037, 'kcal'), 2_037, 'kcal')).toBe(2_000);
    expect(pickerSave(2_050, 2_000, 2_037, 'kcal')).toBe(2_050);
  });
});

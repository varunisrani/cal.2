import { describe, expect, it } from 'vitest';
import {
  ENERGY_GOAL_WHEEL,
  ENERGY_MEASURES,
  KJ_PER_KCAL,
  fromDisplay,
  isEnergyMeasure,
  parseEnergy,
  pickerSave,
  pickerStart,
  toDisplay,
  toDisplayExact,
} from './energy';

describe('isEnergyMeasure', () => {
  it('accepts the two setting values and nothing else', () => {
    expect(ENERGY_MEASURES).toEqual(['kcal', 'kJ']);
    expect(isEnergyMeasure('kcal')).toBe(true);
    expect(isEnergyMeasure('kJ')).toBe(true);
    for (const value of ['kj', 'KJ', 'Kcal', 'calories', '', null, undefined, 1]) {
      expect(isEnergyMeasure(value)).toBe(false);
    }
  });
});

describe('toDisplay', () => {
  it('shows kJ as whole numbers at 4.184 kJ per kcal', () => {
    expect(KJ_PER_KCAL).toBe(4.184);
    expect(toDisplay(0, 'kJ')).toBe(0);
    expect(toDisplay(1, 'kJ')).toBe(4);
    expect(toDisplay(100, 'kJ')).toBe(418);
    expect(toDisplay(2000, 'kJ')).toBe(8368);
  });

  it('leaves kcal as it is', () => {
    expect(toDisplay(1234, 'kcal')).toBe(1234);
    expect(toDisplay(1523.4, 'kcal')).toBe(1523.4);
  });
});

describe('toDisplayExact', () => {
  it('keeps the unrounded amount for charts and averages', () => {
    expect(toDisplayExact(250, 'kJ')).toBeCloseTo(1046, 9);
    expect(toDisplayExact(1, 'kJ')).toBe(4.184);
    expect(toDisplayExact(1523.4, 'kcal')).toBe(1523.4);
  });
});

describe('fromDisplay', () => {
  it('turns kJ back into whole kcal', () => {
    expect(fromDisplay(8368, 'kJ')).toBe(2000);
    expect(fromDisplay(418, 'kJ')).toBe(100);
    expect(fromDisplay(4.184, 'kJ')).toBe(1);
    expect(fromDisplay(8368.4, 'kJ')).toBe(2000);
  });

  it('rounds typed kcal to whole kcal', () => {
    expect(fromDisplay(1200, 'kcal')).toBe(1200);
    expect(fromDisplay(1234.6, 'kcal')).toBe(1235);
  });

  it('gives back the same kcal after showing it in kJ, for every kcal from 0 to 10 000', () => {
    for (let kcal = 0; kcal <= 10_000; kcal++) {
      if (fromDisplay(toDisplay(kcal, 'kJ'), 'kJ') !== kcal) {
        expect.fail(`${kcal} kcal did not survive the kJ round trip`);
      }
    }
  });
});

describe('parseEnergy', () => {
  it('reads the locale grouping and decimal marks', () => {
    expect(parseEnergy('8368', 'en-US')).toBe(8368);
    expect(parseEnergy('8,368', 'en-US')).toBe(8368);
    expect(parseEnergy(' 8368.4 ', 'en-US')).toBe(8368.4);
    expect(parseEnergy('8.368', 'de-DE')).toBe(8368);
    expect(parseEnergy('418,4', 'de-DE')).toBe(418.4);
    expect(parseEnergy('8 368', 'fr-FR')).toBe(8368);
    expect(parseEnergy('1200', 'en-US')).toBe(1200);
  });

  it('falls back to a comma as the decimal mark', () => {
    expect(parseEnergy('418,4', 'en-US')).toBe(418.4);
    expect(parseEnergy('1,5', 'en-US')).toBe(1.5);
    expect(parseEnergy('8368.4', 'de-DE')).toBe(8368.4);
  });

  it('feeds fromDisplay to give the stored kcal', () => {
    expect(fromDisplay(parseEnergy(' 8368.4 ', 'en-US') ?? Number.NaN, 'kJ')).toBe(2000);
    expect(fromDisplay(parseEnergy('418,4', 'de-DE') ?? Number.NaN, 'kJ')).toBe(100);
  });

  it('refuses empty, non-numeric, trailing junk, negative and non-finite input', () => {
    for (const text of [
      '',
      '   ',
      'abc',
      '12abc',
      '-5',
      '-50',
      '−5',
      '+5',
      'Infinity',
      'NaN',
      '1e3',
      '8.368,4.1',
      '9'.repeat(400),
    ]) {
      expect(parseEnergy(text, 'en-US'), text).toBeNull();
    }
  });

  it('does not throw for a locale tag Intl cannot use', () => {
    expect(parseEnergy('8,368', 'not a locale')).toBe(8368);
  });
});

describe('pickerStart', () => {
  it('uses the same span in both units', () => {
    expect(ENERGY_GOAL_WHEEL.kcal).toEqual({ min: 800, max: 6000, step: 50 });
    expect(ENERGY_GOAL_WHEEL.kJ).toEqual({ min: 3400, max: 25_100, step: 100 });
    const { min, max, step } = ENERGY_GOAL_WHEEL.kJ;
    expect(fromDisplay(min, 'kJ')).toBeGreaterThanOrEqual(800);
    expect(fromDisplay(max, 'kJ')).toBeLessThanOrEqual(6000);
    expect(min % step).toBe(0);
  });

  it('opens on the shown goal snapped down onto the step grid', () => {
    expect(pickerStart(2000, 'kJ')).toBe(8300);
    expect(pickerStart(2037, 'kcal')).toBe(2000);
    expect(pickerStart(2000, 'kcal')).toBe(2000);
  });

  it('keeps the opening position inside the wheel', () => {
    expect(pickerStart(790, 'kcal')).toBe(800);
    expect(pickerStart(9000, 'kcal')).toBe(6000);
    expect(pickerStart(100, 'kJ')).toBe(3400);
    expect(pickerStart(9000, 'kJ')).toBe(25_100);
  });
});

describe('pickerSave', () => {
  it('keeps the exact kcal goal when the kJ wheel was not moved (R06.20)', () => {
    const start = pickerStart(2000, 'kJ');
    expect(pickerSave(start, start, 2000, 'kJ')).toBe(2000);
    // Without the rule the untouched wheel would store 8 300 kJ = 1 984 kcal.
    expect(fromDisplay(start, 'kJ')).toBe(1984);
    for (const goal of [1234, 1850, 2000, 2345, 3999]) {
      const opened = pickerStart(goal, 'kJ');
      expect(pickerSave(opened, opened, goal, 'kJ')).toBe(goal);
    }
  });

  it('converts a kJ pick that moved the wheel', () => {
    expect(pickerSave(8400, 8300, 2000, 'kJ')).toBe(2008);
    expect(pickerSave(3400, 8300, 2000, 'kJ')).toBe(813);
  });

  it('stores the picked kcal row, even when the wheel was not moved', () => {
    expect(pickerSave(2000, 2000, 2037, 'kcal')).toBe(2000);
    expect(pickerSave(2100, 2000, 2037, 'kcal')).toBe(2100);
  });
});

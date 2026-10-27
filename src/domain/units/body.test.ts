import { describe, expect, it } from 'vitest';
import {
  cmFromFeetInches,
  cmWheel,
  feetInches,
  formatPace,
  formatWeight,
  ftInWheel,
  HEIGHT_WHEEL,
  heightCmShown,
  isHeightDisplayUnit,
  isWeightDisplayUnit,
  kgFromPounds,
  LB_PER_KG,
  WEIGHT_DISPLAY_UNITS,
  WEIGHT_WHEEL,
  weightFromDisplay,
  weightFromWheel,
  weightShown,
  weightToDisplay,
  weightWheel,
} from './body';

describe('body units', () => {
  it('guards the weight and height unit values: kg is the only weight unit (D-16.91)', () => {
    expect(WEIGHT_DISPLAY_UNITS).toEqual(['kg']);
    expect(isWeightDisplayUnit('kg')).toBe(true);
    expect(isHeightDisplayUnit('cm')).toBe(true);
    expect(isHeightDisplayUnit('ftIn')).toBe(true);
    for (const value of ['lb', 'lbs', 'KG', '', null])
      expect(isWeightDisplayUnit(value)).toBe(false);
    for (const value of ['ftin', 'in', 'CM', '', null])
      expect(isHeightDisplayUnit(value)).toBe(false);
  });
});

describe('weight conversion', () => {
  it('reads kg as itself', () => {
    expect(weightToDisplay(70, 'kg')).toBe(70);
    expect(weightFromDisplay(72.57, 'kg')).toBe(72.57);
  });

  it('shows weight rounded to one decimal', () => {
    expect(weightShown(70.06, 'kg')).toBe(70.1);
    expect(weightShown(69.96, 'kg')).toBe(70);
  });
});

describe('kgFromPounds', () => {
  it('turns an imported pound value into kg with the one pound factor, unrounded', () => {
    expect(LB_PER_KG).toBe(2.20462);
    expect(kgFromPounds(160)).toBe(160 / 2.20462);
    expect(weightShown(kgFromPounds(160), 'kg')).toBe(72.6);
    expect(weightShown(kgFromPounds(154.3234), 'kg')).toBe(70);
    for (const kg of [20, 55.5, 70, 72.57, 113.4, 250]) {
      expect(kgFromPounds(kg * LB_PER_KG)).toBeCloseTo(kg, 10);
    }
  });
});

describe('formatWeight', () => {
  it('writes exactly one decimal in the locale', () => {
    expect(formatWeight(70, 'kg', 'en-US')).toBe('70.0');
    expect(formatWeight(72.46, 'kg', 'en-US')).toBe('72.5');
    expect(formatWeight(70, 'kg', 'de-DE')).toBe('70,0');
  });
});

describe('formatPace', () => {
  it('writes kg per week with up to two decimals and no trailing zeros', () => {
    expect(formatPace(0.25, 'kg')).toBe('0.25');
    expect(formatPace(0.5, 'kg')).toBe('0.5');
    expect(formatPace(1, 'kg')).toBe('1');
    expect(formatPace(0.755, 'kg')).toBe('0.76');
  });
});

describe('weightWheel', () => {
  it('uses 20–250 kg for every weight wheel', () => {
    expect(WEIGHT_WHEEL).toEqual({ kg: { min: 20, max: 250 } });
  });

  it('splits a weight into whole units and tenths', () => {
    expect(weightWheel(72.46, 'kg')).toEqual({ whole: 72, tenth: 5 });
    expect(weightWheel(70, 'kg')).toEqual({ whole: 70, tenth: 0 });
  });

  it('opens 69.96 kg on 70.0, never 69.9 (R05.10)', () => {
    // A value just below a whole number rounds up into the next whole, never to a tenth of 10.
    expect(weightWheel(69.96, 'kg')).toEqual({ whole: 70, tenth: 0 });
    expect(weightWheel(kgFromPounds(160), 'kg')).toEqual({ whole: 72, tenth: 6 });
  });

  it('keeps every tenth of the kg wheel through a store and a reopen (R05.10)', () => {
    for (let tenths = 200; tenths <= 2_500; tenths += 1) {
      const wheel = { whole: Math.floor(tenths / 10), tenth: tenths % 10 };
      const back = weightWheel(weightFromWheel(wheel, 'kg'), 'kg');
      if (back.whole !== wheel.whole || back.tenth !== wheel.tenth) {
        expect.fail(`${wheel.whole}.${wheel.tenth} kg came back as ${back.whole}.${back.tenth}`);
      }
    }
  });

  it('holds the opening position to the range', () => {
    expect(weightWheel(19.9, 'kg')).toEqual({ whole: 20, tenth: 0 });
    expect(weightWheel(260, 'kg')).toEqual({ whole: 250, tenth: 0 });
    expect(weightWheel(kgFromPounds(40), 'kg')).toEqual({ whole: 20, tenth: 0 });
  });
});

describe('weightFromWheel', () => {
  it('returns kg at full precision', () => {
    expect(weightFromWheel({ whole: 72, tenth: 5 }, 'kg')).toBe(72.5);
  });

  it('holds the stored value to the range', () => {
    expect(weightFromWheel({ whole: 250, tenth: 9 }, 'kg')).toBe(250);
    expect(weightFromWheel({ whole: 19, tenth: 0 }, 'kg')).toBe(20);
  });
});

describe('feetInches', () => {
  it('rounds to the nearest inch, so 170 cm is 5 ft 7 in and 180 cm is 5 ft 11 in', () => {
    expect(feetInches(170)).toEqual({ feet: 5, inches: 7 });
    expect(feetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(feetInches(182.88)).toEqual({ feet: 6, inches: 0 });
  });

  it('carries 12 inches into the next foot', () => {
    // 182 cm is 71.65 in, which rounds to 72: 6 ft 0 in, never 5 ft 12 in.
    expect(feetInches(182)).toEqual({ feet: 6, inches: 0 });
  });
});

describe('heightCmShown', () => {
  it('truncates to whole centimetres', () => {
    expect(heightCmShown(170.9)).toBe(170);
    expect(heightCmShown(170.18)).toBe(170);
    expect(heightCmShown(175)).toBe(175);
  });
});

describe('height wheels', () => {
  it('cover 100–250 cm and 3 ft 0 in to 8 ft 11 in', () => {
    expect(HEIGHT_WHEEL.cm).toEqual({ min: 100, max: 250 });
    expect(HEIGHT_WHEEL.inches).toEqual({ min: 36, max: 107 });
  });

  it('open the cm wheel on the nearest whole cm inside the range', () => {
    expect(cmWheel(170.6)).toBe(171);
    expect(cmWheel(99)).toBe(100);
    expect(cmWheel(300)).toBe(250);
  });

  it('open the feet and inches wheels on the nearest inch inside the range', () => {
    expect(ftInWheel(170)).toEqual({ feet: 5, inches: 7 });
    expect(ftInWheel(80)).toEqual({ feet: 3, inches: 0 });
    expect(ftInWheel(300)).toEqual({ feet: 8, inches: 11 });
  });

  it('store feet and inches as unrounded cm', () => {
    expect(cmFromFeetInches(5, 7)).toBeCloseTo(170.18, 10);
    expect(cmFromFeetInches(6, 0)).toBeCloseTo(182.88, 10);
  });

  it('convert the current pick when the unit is switched inside the sheet', () => {
    expect(cmWheel(cmFromFeetInches(5, 7))).toBe(170);
    expect(ftInWheel(cmWheel(171))).toEqual({ feet: 5, inches: 7 });
    expect(cmWheel(cmFromFeetInches(8, 11))).toBe(250);
    expect(ftInWheel(cmWheel(100))).toEqual({ feet: 3, inches: 3 });
  });

  it('keep a feet and inches pick through a round trip', () => {
    for (let total = 36; total <= 107; total += 1) {
      const pick = { feet: Math.floor(total / 12), inches: total % 12 };
      expect(ftInWheel(cmFromFeetInches(pick.feet, pick.inches))).toEqual(pick);
    }
  });
});

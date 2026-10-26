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
  LB_PER_KG,
  WEIGHT_WHEEL,
  weightFromDisplay,
  weightFromWheel,
  weightShown,
  weightToDisplay,
  weightWheel,
} from './body';

describe('body units', () => {
  it('guards the weight and height unit values', () => {
    expect(isWeightDisplayUnit('kg')).toBe(true);
    expect(isWeightDisplayUnit('lb')).toBe(true);
    expect(isHeightDisplayUnit('cm')).toBe(true);
    expect(isHeightDisplayUnit('ftIn')).toBe(true);
    for (const value of ['lbs', 'KG', '', null]) expect(isWeightDisplayUnit(value)).toBe(false);
    for (const value of ['ftin', 'in', 'CM', '', null])
      expect(isHeightDisplayUnit(value)).toBe(false);
  });
});

describe('weight conversion', () => {
  it('uses one pound factor in both directions', () => {
    expect(LB_PER_KG).toBe(2.20462);
    expect(weightToDisplay(70, 'lb')).toBeCloseTo(154.3234, 10);
    expect(weightToDisplay(70, 'kg')).toBe(70);
    for (const kg of [20, 55.5, 70, 72.57, 113.4, 250]) {
      expect(weightFromDisplay(weightToDisplay(kg, 'lb'), 'lb')).toBeCloseTo(kg, 10);
    }
  });

  it('shows weight rounded to one decimal', () => {
    expect(weightShown(70, 'lb')).toBe(154.3);
    expect(weightShown(70.06, 'kg')).toBe(70.1);
  });
});

describe('formatWeight', () => {
  it('writes exactly one decimal in the locale', () => {
    expect(formatWeight(70, 'lb', 'en-US')).toBe('154.3');
    expect(formatWeight(70, 'kg', 'en-US')).toBe('70.0');
    expect(formatWeight(70, 'lb', 'de-DE')).toBe('154,3');
  });
});

describe('formatPace', () => {
  it('writes kg per week with up to two decimals and no trailing zeros', () => {
    expect(formatPace(0.25, 'kg')).toBe('0.25');
    expect(formatPace(0.5, 'kg')).toBe('0.5');
    expect(formatPace(1, 'kg')).toBe('1');
  });

  it('converts to lb before rounding', () => {
    expect(formatPace(0.25, 'lb')).toBe('0.55');
    expect(formatPace(0.5, 'lb')).toBe('1.1');
    expect(formatPace(1, 'lb')).toBe('2.2');
    expect(formatPace(0.75, 'lb')).toBe('1.65');
  });
});

describe('weightWheel', () => {
  it('uses 20–250 kg and 50–500 lb for every weight wheel', () => {
    expect(WEIGHT_WHEEL).toEqual({ kg: { min: 20, max: 250 }, lb: { min: 50, max: 500 } });
  });

  it('splits a weight into whole units and tenths', () => {
    expect(weightWheel(72.46, 'kg')).toEqual({ whole: 72, tenth: 5 });
    expect(weightWheel(70, 'lb')).toEqual({ whole: 154, tenth: 3 });
  });

  it('shows 160.0 lb after a round trip through kg, not 159.9 (R05.10)', () => {
    const kg = weightFromWheel({ whole: 160, tenth: 0 }, 'lb');
    expect(weightWheel(kg, 'lb')).toEqual({ whole: 160, tenth: 0 });
    // A value just below a whole number rounds up into the next whole, never to a tenth of 10.
    expect(weightWheel(weightFromDisplay(159.96, 'lb'), 'lb')).toEqual({ whole: 160, tenth: 0 });
  });

  it('keeps every tenth of the lb wheel after a round trip through kg (R05.10)', () => {
    for (let tenths = 500; tenths <= 5_000; tenths += 1) {
      const wheel = { whole: Math.floor(tenths / 10), tenth: tenths % 10 };
      const back = weightWheel(weightFromWheel(wheel, 'lb'), 'lb');
      if (back.whole !== wheel.whole || back.tenth !== wheel.tenth) {
        expect.fail(`${wheel.whole}.${wheel.tenth} lb came back as ${back.whole}.${back.tenth}`);
      }
    }
  });

  it('holds the opening position to the range', () => {
    expect(weightWheel(19.9, 'kg')).toEqual({ whole: 20, tenth: 0 });
    expect(weightWheel(260, 'kg')).toEqual({ whole: 250, tenth: 0 });
    expect(weightWheel(weightFromDisplay(40, 'lb'), 'lb')).toEqual({ whole: 50, tenth: 0 });
    expect(weightWheel(weightFromDisplay(600, 'lb'), 'lb')).toEqual({ whole: 500, tenth: 0 });
  });
});

describe('switching the weight unit inside the sheet', () => {
  it('converts the current pick and holds it to the other wheel', () => {
    const fromLb = weightWheel(weightFromWheel({ whole: 160, tenth: 0 }, 'lb'), 'kg');
    expect(fromLb).toEqual({ whole: 72, tenth: 6 });
    expect(weightWheel(weightFromWheel(fromLb, 'kg'), 'lb')).toEqual({ whole: 160, tenth: 1 });
    // 20.0 kg is 44.1 lb, below the lb wheel, which starts at 50.0.
    expect(weightWheel(weightFromWheel({ whole: 20, tenth: 0 }, 'kg'), 'lb')).toEqual({
      whole: 50,
      tenth: 0,
    });
  });
});

describe('weightFromWheel', () => {
  it('returns kg at full precision', () => {
    expect(weightFromWheel({ whole: 72, tenth: 5 }, 'kg')).toBe(72.5);
    expect(weightFromWheel({ whole: 160, tenth: 0 }, 'lb')).toBe(160 / LB_PER_KG);
  });

  it('holds the stored value to the range', () => {
    expect(weightFromWheel({ whole: 250, tenth: 9 }, 'kg')).toBe(250);
    expect(weightFromWheel({ whole: 19, tenth: 0 }, 'kg')).toBe(20);
    expect(weightFromWheel({ whole: 500, tenth: 5 }, 'lb')).toBe(500 / LB_PER_KG);
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

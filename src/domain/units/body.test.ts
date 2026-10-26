import { describe, expect, it } from 'vitest';
import {
  HEIGHT_LIMITS,
  WEIGHT_LIMITS,
  formatPace,
  formatWeight,
  fromFeetInches,
  heightCmShown,
  heightWheelCm,
  heightWheelFeetInches,
  isHeightMeasure,
  isWeightMeasure,
  toFeetInches,
  weightFromDisplay,
  weightFromWheel,
  weightToDisplay,
  weightWheel,
} from './body';

describe('unit guards', () => {
  it('accept the setting values and nothing else', () => {
    expect(isWeightMeasure('kg')).toBe(true);
    expect(isWeightMeasure('lb')).toBe(true);
    expect(isHeightMeasure('cm')).toBe(true);
    expect(isHeightMeasure('ftIn')).toBe(true);
    for (const value of ['lbs', 'KG', 'ftin', 'in', '', null, 2]) {
      expect(isWeightMeasure(value)).toBe(false);
      expect(isHeightMeasure(value)).toBe(false);
    }
  });
});

describe('weight conversion', () => {
  it('uses 2.20462 lb per kg in both directions', () => {
    expect(weightToDisplay(1, 'lb')).toBe(2.20462);
    expect(weightFromDisplay(2.20462, 'lb')).toBe(1);
    expect(weightToDisplay(70, 'kg')).toBe(70);
    expect(weightFromDisplay(70, 'kg')).toBe(70);
    for (const kg of [20, 55.5, 70, 72.57, 140.3, 250]) {
      expect(weightFromDisplay(weightToDisplay(kg, 'lb'), 'lb')).toBeCloseTo(kg, 10);
    }
  });
});

describe('formatWeight', () => {
  it('shows one decimal in either unit', () => {
    expect(formatWeight(70, 'kg', 'en-US')).toBe('70.0');
    expect(formatWeight(70, 'lb', 'en-US')).toBe('154.3');
    expect(formatWeight(72.55, 'kg', 'en-US')).toBe('72.6');
    expect(formatWeight(70, 'lb', 'de-DE')).toBe('154,3');
  });
});

describe('formatPace', () => {
  it('writes the kg pace with up to two decimals and no trailing zeros', () => {
    expect(formatPace(0.25, 'kg')).toBe('0.25');
    expect(formatPace(0.5, 'kg')).toBe('0.5');
    expect(formatPace(1, 'kg')).toBe('1');
  });

  it('converts the pace to lb before writing it', () => {
    expect(formatPace(0.25, 'lb')).toBe('0.55');
    expect(formatPace(0.5, 'lb')).toBe('1.1');
    expect(formatPace(1, 'lb')).toBe('2.2');
  });

  it('writes zero as "0"', () => {
    expect(formatPace(0, 'kg')).toBe('0');
    expect(formatPace(0, 'lb')).toBe('0');
  });
});

describe('height', () => {
  it('shows whole cm cut, not rounded', () => {
    expect(heightCmShown(170)).toBe(170);
    expect(heightCmShown(182.88)).toBe(182);
    expect(heightCmShown(170.18)).toBe(170);
  });

  it('shows feet and inches from the nearest whole inch', () => {
    expect(toFeetInches(170)).toEqual({ feet: 5, inches: 7 });
    expect(toFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(toFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
    // 71.85 inches rounds into the next foot, never to 5′12″.
    expect(toFeetInches(182.5)).toEqual({ feet: 6, inches: 0 });
    expect(toFeetInches(152.4)).toEqual({ feet: 5, inches: 0 });
  });

  it('turns feet and inches back into unrounded cm', () => {
    expect(fromFeetInches({ feet: 5, inches: 7 })).toBeCloseTo(170.18, 10);
    expect(fromFeetInches({ feet: 6, inches: 0 })).toBeCloseTo(182.88, 10);
    for (let inches = 36; inches <= 107; inches++) {
      const height = { feet: Math.floor(inches / 12), inches: inches % 12 };
      expect(toFeetInches(fromFeetInches(height))).toEqual(height);
    }
  });
});

describe('weightWheel', () => {
  it('shows 160.0 lb again after the value went through kg (R05.10)', () => {
    const kg = weightFromWheel({ whole: 160, tenth: 0 }, 'lb');
    expect(weightWheel(kg, 'lb')).toEqual({ whole: 160, tenth: 0 });
    // 84.0 lb comes back from kg as 83.99999…, which a truncated tenth shows as 83.9.
    const back = weightToDisplay(weightFromWheel({ whole: 84, tenth: 0 }, 'lb'), 'lb');
    expect(back).toBeLessThan(84);
    expect(weightWheel(weightFromDisplay(back, 'lb'), 'lb')).toEqual({ whole: 84, tenth: 0 });
  });

  it('keeps the value when the wheel switches unit', () => {
    const kg = weightFromWheel({ whole: 154, tenth: 3 }, 'lb');
    expect(weightWheel(kg, 'kg')).toEqual({ whole: 70, tenth: 0 });
    expect(weightWheel(weightFromWheel({ whole: 70, tenth: 0 }, 'kg'), 'lb')).toEqual({
      whole: 154,
      tenth: 3,
    });
    // 20 kg is 44.1 lb, below the lb wheel: switching lands on its first row.
    expect(weightWheel(weightFromWheel({ whole: 20, tenth: 0 }, 'kg'), 'lb')).toEqual({
      whole: 50,
      tenth: 0,
    });
  });

  it('rounds to the nearest tenth instead of truncating (R05.10)', () => {
    // 159.96 lb would read 159.9 with a truncated tenth.
    expect(weightWheel(weightFromDisplay(159.96, 'lb'), 'lb')).toEqual({ whole: 160, tenth: 0 });
    expect(weightWheel(weightFromDisplay(159.94, 'lb'), 'lb')).toEqual({ whole: 159, tenth: 9 });
    expect(weightWheel(72.55, 'kg')).toEqual({ whole: 72, tenth: 6 });
    expect(weightWheel(70, 'lb')).toEqual({ whole: 154, tenth: 3 });
  });

  it('gives back every wheel position after a round trip through stored kg (R05.10)', () => {
    for (const unit of ['kg', 'lb'] as const) {
      const { min, max } = WEIGHT_LIMITS[unit];
      for (let tenths = min * 10; tenths <= max * 10; tenths++) {
        const wheel = { whole: Math.floor(tenths / 10), tenth: tenths % 10 };
        const back = weightWheel(weightFromWheel(wheel, unit), unit);
        if (back.whole !== wheel.whole || back.tenth !== wheel.tenth) {
          expect.fail(
            `${wheel.whole}.${wheel.tenth} ${unit} came back as ${back.whole}.${back.tenth}`,
          );
        }
      }
    }
  });

  it('keeps the weight inside 20–250 kg or 50–500 lb', () => {
    expect(WEIGHT_LIMITS).toEqual({ kg: { min: 20, max: 250 }, lb: { min: 50, max: 500 } });
    expect(weightWheel(19.9, 'kg')).toEqual({ whole: 20, tenth: 0 });
    expect(weightWheel(250.06, 'kg')).toEqual({ whole: 250, tenth: 0 });
    expect(weightWheel(300, 'kg')).toEqual({ whole: 250, tenth: 0 });
    expect(weightWheel(weightFromDisplay(40, 'lb'), 'lb')).toEqual({ whole: 50, tenth: 0 });
    expect(weightWheel(250, 'lb')).toEqual({ whole: 500, tenth: 0 });
  });

  it('stores the wheel value in kg unrounded and inside the limits', () => {
    expect(weightFromWheel({ whole: 72, tenth: 6 }, 'kg')).toBe(72.6);
    expect(weightFromWheel({ whole: 160, tenth: 0 }, 'lb')).toBe(160 / 2.20462);
    expect(weightFromWheel({ whole: 250, tenth: 9 }, 'kg')).toBe(250);
    expect(weightFromWheel({ whole: 19, tenth: 5 }, 'kg')).toBe(20);
    expect(weightFromWheel({ whole: 500, tenth: 9 }, 'lb')).toBeCloseTo(500 / 2.20462, 10);
  });
});

describe('height wheels', () => {
  it('opens the cm wheel on the nearest whole cm inside 100–250', () => {
    expect(HEIGHT_LIMITS.cm).toEqual({ min: 100, max: 250 });
    expect(heightWheelCm(170.18)).toBe(170);
    expect(heightWheelCm(182.88)).toBe(183);
    expect(heightWheelCm(90)).toBe(100);
    expect(heightWheelCm(260)).toBe(250);
  });

  it('opens the feet and inches wheels inside 3′0″–8′11″', () => {
    expect(HEIGHT_LIMITS.ftIn).toEqual({ min: 36, max: 107 });
    expect(heightWheelFeetInches(170)).toEqual({ feet: 5, inches: 7 });
    expect(heightWheelFeetInches(80)).toEqual({ feet: 3, inches: 0 });
    expect(heightWheelFeetInches(280)).toEqual({ feet: 8, inches: 11 });
  });
});

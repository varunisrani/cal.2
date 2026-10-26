import { describe, expect, it } from 'vitest';
import { div, floorMod } from './integers';

describe('div', () => {
  it('divides whole numbers and cuts the quotient toward zero (R01.9)', () => {
    expect(div(1_626, 4)).toBe(406);
    expect(div(7, 2)).toBe(3);
    expect(div(8, 9)).toBe(0);
    expect(div(-7, 2)).toBe(-3);
    expect(div(-1, 4) === 0).toBe(true);
  });
});

describe('floorMod', () => {
  it('gives a remainder with the sign of the divisor, unlike % (R01.9)', () => {
    expect(floorMod(2_001, 4)).toBe(1);
    expect(floorMod(2_000, 4)).toBe(0);
    expect(floorMod(-1, 4)).toBe(3);
    expect(-1 % 4).toBe(-1);
    expect(floorMod(-8, 4)).toBe(0);
    expect(floorMod(59, 4)).toBe(3);
  });
});

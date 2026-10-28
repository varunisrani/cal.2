import { describe, expect, it } from 'vitest';
import { makeEntry } from '../../test/factories';
import { caloriesPassed, proteinReached, sugarPassed, sugarTotal, weekReached } from './events';

describe('when an event notice is due (P17-02, D-16.101)', () => {
  it('sums sugar over the foods with a sugar figure only', () => {
    const entries = [
      makeEntry({ nutrients: { sugar: 30 } }),
      makeEntry({ nutrients: {} }),
      makeEntry({ nutrients: { sugar: 22.5, fibre: 3 } }),
    ];
    expect(sugarTotal(entries)).toBe(52.5);
    expect(sugarTotal([makeEntry({ nutrients: {} })])).toBeNull();
    expect(sugarTotal([])).toBeNull();
  });

  it('passes the sugar limit above it, never without a figure or a limit', () => {
    expect(sugarPassed(50.1, 50)).toBe(true);
    expect(sugarPassed(50, 50)).toBe(false);
    expect(sugarPassed(null, 50)).toBe(false);
    expect(sugarPassed(80, 0)).toBe(false);
  });

  it('passes the calories only beyond 110 % of the target', () => {
    expect(caloriesPassed(2_200, 2_000)).toBe(false);
    expect(caloriesPassed(2_201, 2_000)).toBe(true);
    expect(caloriesPassed(500, 0)).toBe(false);
  });

  it('reaches protein at its target, and the week at 150 minutes', () => {
    expect(proteinReached(119.9, 120)).toBe(false);
    expect(proteinReached(120, 120)).toBe(true);
    expect(proteinReached(10, 0)).toBe(false);
    expect(weekReached(149)).toBe(false);
    expect(weekReached(150)).toBe(true);
  });
});

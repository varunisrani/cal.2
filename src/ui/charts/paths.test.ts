import { describe, expect, it } from 'vitest';
import { areaPath, roundedTopBar, smoothPath } from './paths';

/** The numbers of a path string, in order. */
function numbers(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** The end point of every cubic piece of a path. */
function pieceEnds(path: string): Array<[number, number]> {
  return [...path.matchAll(/C([^CLZ]+)/g)].map((match) => {
    const values = numbers(match[1] ?? '');
    return [values[4] ?? Number.NaN, values[5] ?? Number.NaN];
  });
}

describe('smoothPath', () => {
  const points = [
    { x: 10, y: 80 },
    { x: 60, y: 40 },
    { x: 110, y: 95 },
    { x: 160, y: 20 },
  ];

  it('starts at the first point and passes through every other one', () => {
    const path = smoothPath(points);
    expect(path.startsWith('M10 80')).toBe(true);
    expect(pieceEnds(path)).toEqual([
      [60, 40],
      [110, 95],
      [160, 20],
    ]);
  });

  it('keeps evenly spaced points on a straight line straight', () => {
    const line = [0, 1, 2, 3].map((step) => ({ x: step * 30, y: 100 - step * 20 }));
    const values = numbers(smoothPath(line));
    for (let index = 0; index < values.length; index += 2) {
      const x = values[index] ?? Number.NaN;
      const y = values[index + 1] ?? Number.NaN;
      expect(y).toBeCloseTo(100 - (x * 20) / 30, 2);
    }
  });

  it('is a single move for one point and empty for none', () => {
    expect(smoothPath([{ x: 5, y: 7 }])).toBe('M5 7');
    expect(smoothPath([])).toBe('');
  });
});

describe('areaPath', () => {
  it('closes the curve on the floor below its first and last points', () => {
    const path = areaPath(
      [
        { x: 10, y: 80 },
        { x: 60, y: 40 },
        { x: 110, y: 95 },
      ],
      190,
    );
    expect(path.startsWith('M10 190L10 80C')).toBe(true);
    expect(path.endsWith('L110 190Z')).toBe(true);
  });
});

describe('roundedTopBar', () => {
  it('rounds the two top corners and stands on the bottom', () => {
    expect(roundedTopBar(10, 50, 20, 140, 4)).toBe(
      'M10 190V54A4 4 0 0 1 14 50H26A4 4 0 0 1 30 54V190Z',
    );
  });

  it('rounds less than asked on a bar too thin or too short', () => {
    expect(roundedTopBar(0, 188, 1, 2, 4)).toContain('A0.5 0.5');
    expect(roundedTopBar(0, 189, 30, 1, 4)).toContain('A1 1');
  });

  it('draws nothing for a bar with no width or height', () => {
    expect(roundedTopBar(0, 190, 10, 0, 4)).toBe('');
    expect(roundedTopBar(0, 100, 0, 90, 4)).toBe('');
  });
});

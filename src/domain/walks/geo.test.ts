import { describe, expect, it } from 'vitest';
import { countedMoves, isUsableFix, metresBetween, MAX_GAP_MS } from './geo';
import type { RoutePoint } from './model';
import { METRES_PER_DEGREE, scriptWalk, WALK_START } from './__fixtures__/walks';

function fix(seconds: number, northM: number, accuracyM = 5, eastDeg = 0): RoutePoint {
  return {
    at: WALK_START + seconds * 1000,
    lat: 52.52 + northM / METRES_PER_DEGREE,
    lon: 13.405 + eastDeg,
    accuracyM,
  };
}

describe('metresBetween', () => {
  it('measures great-circle metres', () => {
    expect(metresBetween({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(METRES_PER_DEGREE, 3);
    // Berlin to Paris, about 878 km.
    const km = metresBetween({ lat: 52.52, lon: 13.405 }, { lat: 48.8566, lon: 2.3522 }) / 1000;
    expect(km).toBeGreaterThan(875);
    expect(km).toBeLessThan(880);
    expect(metresBetween({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBe(0);
  });
});

describe('countedMoves', () => {
  it('adds up a steady walk', () => {
    const walk = scriptWalk([{ seconds: 600, speed: 1.4, cadence: 110 }]);
    const metres = countedMoves(walk.points).reduce((sum, move) => sum + move.metres, 0);
    expect(metres).toBeCloseTo(840, 0);
  });

  it('leaves out fixes worse than 50 m and positions that are not real', () => {
    expect(isUsableFix(fix(0, 0, 50))).toBe(true);
    expect(isUsableFix(fix(0, 0, 51))).toBe(false);
    expect(isUsableFix({ ...fix(0, 0), lat: 91 })).toBe(false);
    expect(isUsableFix({ ...fix(0, 0), lon: Number.NaN })).toBe(false);
    const moves = countedMoves([fix(0, 0), fix(10, 300, 80), fix(20, 20)]);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.metres).toBeCloseTo(20, 1);
  });

  it('never adds up jitter while standing still', () => {
    const wobble = [0, 2, -1.5, 2.5, -2, 1, 0, -2.5, 2].map((north, i) => fix(i * 5, north, 8));
    expect(countedMoves(wobble)).toEqual([]);
  });

  it('counts slow progress from the last counted point, not hop by hop', () => {
    // 0.9 m every 2 s: each hop is under the allowance, but the anchor stays until 3 m is passed.
    const slow = Array.from({ length: 9 }, (_, i) => fix(i * 2, i * 0.9));
    const moves = countedMoves(slow);
    expect(moves.map((move) => move.metres.toFixed(1))).toEqual(['3.6', '3.6']);
  });

  it('leaves out a jump faster than walking and keeps the anchor', () => {
    const moves = countedMoves([fix(0, 0), fix(2, 4), fix(4, 200), fix(6, 8)]);
    expect(moves.map((move) => Math.round(move.metres))).toEqual([4, 4]);
  });

  it('does not count across a gap of more than a minute (a pause or a lost fix)', () => {
    const gapSeconds = MAX_GAP_MS / 1000 + 1;
    const moves = countedMoves([
      fix(0, 0),
      fix(2, 4),
      fix(2 + gapSeconds, 80),
      fix(4 + gapSeconds, 84),
    ]);
    expect(moves.map((move) => Math.round(move.metres))).toEqual([4, 4]);
  });

  it('reads fixes in time order', () => {
    const moves = countedMoves([fix(4, 8), fix(0, 0), fix(2, 4)]);
    expect(moves.map((move) => Math.round(move.metres))).toEqual([4, 4]);
  });
});

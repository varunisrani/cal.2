import { describe, expect, it } from 'vitest';
import {
  decodeRoute,
  encodeRoute,
  MAX_ROUTE_POINTS,
  routeFixes,
  routeShape,
  thinRoute,
} from './route';
import { scriptWalk, WALK_START } from './__fixtures__/walks';

describe('thinRoute', () => {
  it('keeps short routes whole and thins long ones to the cap, first and last kept', () => {
    expect(thinRoute([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const long = Array.from({ length: 10_001 }, (_, index) => index);
    const thinned = thinRoute(long);
    expect(thinned).toHaveLength(MAX_ROUTE_POINTS);
    expect(thinned[0]).toBe(0);
    expect(thinned[thinned.length - 1]).toBe(10_000);
    expect(thinRoute([1, 2, 3, 4, 5], 3)).toEqual([1, 3, 5]);
  });
});

describe('encodeRoute and decodeRoute', () => {
  it('round-trips a route to a metre and a second', () => {
    const walk = scriptWalk([{ seconds: 600, speed: 1.4, cadence: 100 }]);
    const fixes = routeFixes(walk.points, WALK_START);
    const decoded = decodeRoute(encodeRoute(fixes));
    expect(decoded).toHaveLength(fixes.length);
    decoded?.forEach((fix, index) => {
      expect(fix.lat).toBeCloseTo(fixes[index]!.lat, 5);
      expect(fix.lon).toBeCloseTo(fixes[index]!.lon, 5);
      expect(fix.sec).toBe(fixes[index]!.sec);
    });
  });

  it('keeps negative and large changes', () => {
    const fixes = [
      { lat: -33.8688, lon: 151.2093, sec: 0 },
      { lat: 40.7128, lon: -74.006, sec: 86_400 },
      { lat: 40.71279, lon: -74.00601, sec: 86_402 },
    ];
    expect(decodeRoute(encodeRoute(fixes))).toEqual(fixes);
  });

  it('is short: a 10-minute walk takes a few bytes a fix', () => {
    const walk = scriptWalk([{ seconds: 600, speed: 1.4, cadence: 100 }]);
    const text = encodeRoute(routeFixes(walk.points, WALK_START));
    expect(text.length / walk.points.length).toBeLessThan(6);
  });

  it('reads empty text as no route and refuses text it did not write', () => {
    expect(encodeRoute([])).toBe('');
    expect(decodeRoute('')).toEqual([]);
    expect(decodeRoute('xyz')).toBeNull();
    expect(decodeRoute('r1:!!')).toBeNull();
    // A number cut off in the middle.
    expect(decodeRoute('r1:g')).toBeNull();
  });
});

describe('routeShape', () => {
  it('fits the route into the box, north up, and marks its start and end', () => {
    const shape = routeShape(
      [
        { lat: 52.52, lon: 13.405 },
        { lat: 52.521, lon: 13.405 },
        { lat: 52.521, lon: 13.4065 },
      ],
      200,
      100,
      10,
    );
    expect(shape.path.startsWith('M')).toBe(true);
    expect(shape.path.split('L')).toHaveLength(3);
    // South-west start at the bottom, the north-east end at the top right.
    expect(shape.start!.y).toBeGreaterThan(shape.end!.y);
    expect(shape.end!.x).toBeGreaterThan(shape.start!.x);
    for (const mark of [shape.start!, shape.end!]) {
      expect(mark.x).toBeGreaterThanOrEqual(10);
      expect(mark.x).toBeLessThanOrEqual(190);
      expect(mark.y).toBeGreaterThanOrEqual(10);
      expect(mark.y).toBeLessThanOrEqual(90);
    }
  });

  it('draws no line for fewer than two fixes', () => {
    expect(routeShape([], 100, 100)).toEqual({ path: '', start: null, end: null });
    const one = routeShape([{ lat: 1, lon: 1 }], 100, 100);
    expect(one.path).toBe('');
    expect(one.start).toEqual(one.end);
  });
});

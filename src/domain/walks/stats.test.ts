import { describe, expect, it } from 'vitest';
import type { RoutePoint, StepCount } from './model';
import { walkStats, type WalkInput } from './stats';
import { METRES_PER_DEGREE, scriptWalk, WALK_START, type Leg } from './__fixtures__/walks';

const PERSON = { heightCm: 175, weightKg: 70 };

function input(legs: readonly Leg[], changes: Partial<WalkInput> = {}): WalkInput {
  const walk = scriptWalk(legs);
  return {
    startedAt: WALK_START,
    endAt: walk.endAt,
    activeSeconds: (walk.endAt - WALK_START) / 1000,
    points: walk.points,
    steps: walk.steps,
    locationGranted: true,
    stepsGranted: true,
    ...PERSON,
    ...changes,
  };
}

const TEN_BRISK_MINUTES: Leg[] = [{ seconds: 600, speed: 1.5, cadence: 110 }];

describe('walkStats on a steady walk', () => {
  const stats = walkStats(input(TEN_BRISK_MINUTES));

  it('measures the distance, the active time and the pace', () => {
    expect(stats.activeSeconds).toBe(600);
    expect(stats.distanceM).toBeGreaterThan(895);
    expect(stats.distanceM).toBeLessThanOrEqual(900.5);
    // 1.5 m/s is 11:07 a km.
    expect(stats.paceSecPerKm).toBeCloseTo(667, -1);
    expect(stats.recentPaceSecPerKm).toBeCloseTo(667, -1);
  });

  it('counts the steps and the cadence, overall and minute by minute', () => {
    expect(stats.steps).toBe(1100);
    expect(stats.cadence).toBeCloseTo(110, 5);
    expect(stats.splits.steps).toHaveLength(10);
    for (const steps of stats.splits.steps ?? []) expect(steps).toBeGreaterThanOrEqual(109);
    expect(stats.splits.metres).toHaveLength(10);
    expect(stats.splits.metres?.reduce((sum, m) => sum + m, 0)).toBeCloseTo(stats.distanceM!, -1);
  });

  it('counts every minute as brisk at 110 steps a minute', () => {
    expect(stats.briskKnown).toBe(true);
    expect(stats.briskMinutes).toBe(10);
  });

  it('takes the speed from the route and the METs from the Compendium band', () => {
    expect(stats.speedFrom).toBe('route');
    expect(stats.speedKmh).toBeCloseTo(5.4, 1);
    // 17190: 2.8 to 3.4 mph.
    expect(stats.met).toBe(3.8);
  });

  it('works out the energy as MET × kg × hours and the active part as (MET − 1) × kg × hours', () => {
    expect(stats.kcal).toBeCloseTo((3.8 * 70) / 6, 6);
    expect(stats.activeKcal).toBeCloseTo((2.8 * 70) / 6, 6);
  });
});

describe('walkStats: brisk minutes', () => {
  it('counts no brisk minute at 90 steps a minute', () => {
    expect(walkStats(input([{ seconds: 600, speed: 1, cadence: 90 }])).briskMinutes).toBe(0);
  });

  it('counts only the brisk part of a walk', () => {
    const stats = walkStats(
      input([
        { seconds: 300, speed: 1.5, cadence: 115 },
        { seconds: 300, speed: 0.9, cadence: 80 },
      ]),
    );
    expect(stats.briskMinutes).toBe(5);
  });

  it('uses 4.8 km/h along the route when steps are missing', () => {
    const fast = walkStats(input(TEN_BRISK_MINUTES, { steps: [], stepsGranted: false }));
    expect(fast.steps).toBeNull();
    expect(fast.cadence).toBeNull();
    expect(fast.splits.steps).toBeNull();
    expect(fast.briskKnown).toBe(true);
    expect(fast.briskMinutes).toBe(10);
    const slow = walkStats(
      input([{ seconds: 600, speed: 1.2, cadence: 0 }], { steps: [], stepsGranted: false }),
    );
    // 1.2 m/s is 4.3 km/h.
    expect(slow.briskMinutes).toBe(0);
  });
});

describe('walkStats with a pause', () => {
  // Five minutes, two minutes paused (nothing recorded), five more minutes on from where it stopped.
  function paused(): WalkInput {
    const first = scriptWalk([{ seconds: 300, speed: 1.5, cadence: 110 }]);
    const later = scriptWalk([{ seconds: 300, speed: 1.5, cadence: 110 }], {
      start: first.endAt + 120_000,
    });
    const north = first.metres / METRES_PER_DEGREE;
    const lastSteps = first.steps[first.steps.length - 1]!.steps;
    const points: RoutePoint[] = [
      ...first.points,
      ...later.points.map((point) => ({ ...point, lat: point.lat + north })),
    ];
    const steps: StepCount[] = [
      ...first.steps,
      ...later.steps.map((sample) => ({ ...sample, steps: sample.steps + lastSteps })),
    ];
    return {
      startedAt: WALK_START,
      endAt: later.endAt,
      activeSeconds: 600,
      points,
      steps,
      locationGranted: true,
      stepsGranted: true,
      ...PERSON,
    };
  }

  it('keeps the paused minutes out of the brisk minutes and the distance', () => {
    const stats = walkStats(paused());
    expect(stats.activeSeconds).toBe(600);
    expect(stats.splits.steps).toHaveLength(12);
    expect(stats.splits.steps?.slice(5, 7)).toEqual([0, 0]);
    expect(stats.briskMinutes).toBe(10);
    expect(stats.distanceM).toBeGreaterThan(890);
    expect(stats.distanceM).toBeLessThanOrEqual(900.5);
    expect(stats.steps).toBe(1100);
  });
});

describe('walkStats without sensors', () => {
  it('takes the speed from the steps and the height without location', () => {
    const stats = walkStats(input(TEN_BRISK_MINUTES, { points: [], locationGranted: false }));
    expect(stats.distanceM).toBeNull();
    expect(stats.paceSecPerKm).toBeNull();
    expect(stats.recentPaceSecPerKm).toBeNull();
    expect(stats.splits.metres).toBeNull();
    expect(stats.speedFrom).toBe('steps');
    // 110 steps a minute × 0.414 × 1.75 m = 4.78 km/h.
    expect(stats.speedKmh).toBeCloseTo(4.78, 2);
    expect(stats.met).toBe(3.8);
    expect(stats.briskMinutes).toBe(10);
  });

  it('measures time only without both, at the METs of an ordinary walk, brisk unknown', () => {
    const stats = walkStats(
      input(TEN_BRISK_MINUTES, {
        points: [],
        steps: [],
        locationGranted: false,
        stepsGranted: false,
      }),
    );
    expect(stats).toMatchObject({
      distanceM: null,
      steps: null,
      speedFrom: 'none',
      speedKmh: null,
      briskKnown: false,
      briskMinutes: 0,
      met: 3.0,
    });
    expect(stats.kcal).toBeCloseTo((3 * 70) / 6, 6);
  });

  it('falls back to the steps when location was allowed but no fix came', () => {
    const stats = walkStats(input(TEN_BRISK_MINUTES, { points: [] }));
    expect(stats.distanceM).toBe(0);
    expect(stats.speedFrom).toBe('steps');
  });
});

describe('walkStats: odd input', () => {
  it('keeps the highest step count when a count goes down', () => {
    const stats = walkStats(
      input(TEN_BRISK_MINUTES, {
        steps: [
          { at: WALK_START + 10_000, steps: 20 },
          { at: WALK_START + 20_000, steps: 5 },
          { at: WALK_START + 30_000, steps: 55 },
        ],
      }),
    );
    expect(stats.steps).toBe(55);
  });

  it('measures a live walk up to now, its last minute partial', () => {
    const walk = scriptWalk([{ seconds: 90, speed: 1.5, cadence: 120 }]);
    const stats = walkStats({
      startedAt: WALK_START,
      endAt: WALK_START + 90_000,
      activeSeconds: 90,
      points: walk.points,
      steps: walk.steps,
      locationGranted: true,
      stepsGranted: true,
      ...PERSON,
    });
    expect(stats.splits.steps).toEqual([120, 60]);
    expect(stats.briskMinutes).toBe(2);
    expect(stats.cadence).toBeCloseTo(120, 5);
  });

  it('gives no energy without a weight and no cadence under 30 s', () => {
    const stats = walkStats(input([{ seconds: 20, speed: 1.5, cadence: 110 }], { weightKg: 0 }));
    expect(stats.kcal).toBe(0);
    expect(stats.activeKcal).toBe(0);
    expect(stats.cadence).toBeNull();
  });
});

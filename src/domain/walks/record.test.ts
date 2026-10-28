import { describe, expect, it } from 'vitest';
import { earlierWalks, walkAverages } from './compare';
import type { Walk } from './model';
import { buildWalk, type RecordedWalk } from './record';
import { decodeRoute } from './route';
import { scriptWalk, WALK_START } from './__fixtures__/walks';

const DAY = 86_400_000;

function recorded(changes: Partial<RecordedWalk> = {}): RecordedWalk {
  const walk = scriptWalk([{ seconds: 1800, speed: 1.6, cadence: 112 }]);
  return {
    id: 'walk-1',
    startedAt: WALK_START,
    endedAt: walk.endAt,
    activeSeconds: 1800,
    points: walk.points,
    steps: walk.steps,
    locationGranted: true,
    stepsGranted: true,
    ...changes,
  };
}

const CONTEXT = { heightCm: 175, weightKg: 70, stored: [], heartRate: null };

describe('buildWalk', () => {
  it('keeps every figure, the score and the route of a stopped walk', () => {
    const walk = buildWalk(recorded(), CONTEXT);
    expect(walk).toMatchObject({
      id: 'walk-1',
      startedAt: WALK_START,
      activeSeconds: 1800,
      steps: 3360,
      speedFrom: 'route',
      speedKmh: 5.8,
      cadence: 112,
      briskMinutes: 30,
      briskKnown: true,
      // 17200: 3.5 to 3.9 mph.
      met: 4.8,
      weightKg: 70,
      kcal: Math.round(4.8 * 70 * 0.5),
      activeKcal: Math.round(3.8 * 70 * 0.5),
      heartRate: null,
      writtenToHealth: false,
      paceRatio: null,
    });
    expect(walk.distanceM).toBeGreaterThan(2870);
    expect(walk.distanceM).toBeLessThanOrEqual(2880);
    // No earlier walk: (40 + 25 + 15.6) of 85.
    expect(walk.parts.pace).toBeNull();
    expect(walk.score).toBe(Math.round(((40 + 25 + walk.parts.intensity!) / 85) * 100));
    expect(decodeRoute(walk.route)?.length).toBeGreaterThan(800);
    expect(walk.splits.steps).toHaveLength(30);
  });

  it('compares the pace with the last earlier walks only', () => {
    const before = buildWalk(recorded(), CONTEXT);
    const slower: Walk = {
      ...before,
      id: 'old',
      startedAt: WALK_START - DAY,
      endedAt: WALK_START - DAY + 1,
      speedKmh: 5.0,
    };
    const later: Walk = {
      ...before,
      id: 'later',
      startedAt: WALK_START + DAY,
      endedAt: WALK_START + DAY + 1,
      speedKmh: 9,
    };
    const walk = buildWalk(recorded(), { ...CONTEXT, stored: [slower, later] });
    expect(walk.paceRatio).toBeCloseTo(5.8 / 5, 1);
    expect(walk.parts.pace).toBe(15);
  });
});

describe('earlierWalks and walkAverages', () => {
  const base = buildWalk(recorded(), CONTEXT);
  const stored = Array.from({ length: 12 }, (_, index) => ({
    ...base,
    id: `w${index}`,
    startedAt: WALK_START - (index + 1) * DAY,
    endedAt: WALK_START - (index + 1) * DAY + 1_800_000,
  }));

  it('takes the 10 newest walks that ended before this one started', () => {
    const earlier = earlierWalks(base, [...stored, base]);
    expect(earlier.map((walk) => walk.id)).toEqual(stored.slice(0, 10).map((walk) => walk.id));
  });

  it('averages their minutes, distance, speed and score', () => {
    const averages = walkAverages([
      { activeSeconds: 1200, distanceM: 1500, speedKmh: 4.5, score: 60 },
      { activeSeconds: 2400, distanceM: null, speedKmh: null, score: null },
    ]);
    expect(averages).toEqual({ count: 2, minutes: 30, distanceM: 1500, speedKmh: 4.5, score: 60 });
    expect(walkAverages([])).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { MODERATE_GOAL_MINUTES, weekWalkingMinutes } from './week';
import { WALK_START } from './__fixtures__/walks';

const DAY = 86_400_000;
const MIN = 60_000;

const walk = (startOffset: number, minutes: number, briskMinutes: number) => ({
  startedAt: WALK_START + startOffset,
  endedAt: WALK_START + startOffset + minutes * MIN,
  briskMinutes,
});

describe('weekWalkingMinutes', () => {
  const week = { from: WALK_START - DAY, to: WALK_START + 6 * DAY };

  it('aims at the WHO 150 minutes a week', () => {
    expect(MODERATE_GOAL_MINUTES).toBe(150);
  });

  it('adds the brisk minutes of recorded walks in the week', () => {
    const result = weekWalkingMinutes({
      ...week,
      walks: [walk(0, 40, 32), walk(DAY, 25, 20), walk(-2 * DAY, 30, 30), walk(7 * DAY, 30, 30)],
      sessions: [],
    });
    expect(result).toEqual({ recorded: 52, other: 0, total: 52 });
  });

  it("adds other apps' walking sessions whole, never one overlapping a recorded walk", () => {
    const result = weekWalkingMinutes({
      ...week,
      walks: [walk(0, 40, 32)],
      sessions: [
        // A watch that recorded the same walk.
        { start: WALK_START + 2 * MIN, end: WALK_START + 38 * MIN, type: 'walking' },
        { start: WALK_START + 2 * DAY, end: WALK_START + 2 * DAY + 45 * MIN, type: 'walking' },
        { start: WALK_START + 3 * DAY, end: WALK_START + 3 * DAY + 30 * MIN, type: 'running' },
        { start: WALK_START + 9 * DAY, end: WALK_START + 9 * DAY + 30 * MIN, type: 'walking' },
      ],
    });
    expect(result).toEqual({ recorded: 32, other: 45, total: 77 });
  });
});

import { describe, expect, it } from 'vitest';
import { heartRateSummary, maxHeartRate, zoneOf } from './heartRate';
import { WALK_START } from './__fixtures__/walks';

function samples(bpms: readonly number[], everySeconds = 10) {
  return bpms.map((bpm, index) => ({ at: WALK_START + index * everySeconds * 1000, bpm }));
}

describe('heart-rate zones', () => {
  it('takes 220 − age as the top and starts zones at 50, 60, 70, 80 and 90 %', () => {
    expect(maxHeartRate(40)).toBe(180);
    expect(zoneOf(89, 180)).toBe(0);
    expect(zoneOf(90, 180)).toBe(1);
    expect(zoneOf(108, 180)).toBe(2);
    expect(zoneOf(126, 180)).toBe(3);
    expect(zoneOf(144, 180)).toBe(4);
    expect(zoneOf(162, 180)).toBe(5);
    expect(zoneOf(200, 180)).toBe(5);
  });

  it('adds each sample up to the next one, the last up to the end', () => {
    const summary = heartRateSummary(
      samples([100, 110, 130, 150]),
      WALK_START,
      WALK_START + 40_000,
      40,
    );
    expect(summary).toEqual({
      avgBpm: 123,
      maxBpm: 150,
      maxHr: 180,
      zoneSeconds: [10, 10, 10, 10, 0],
    });
  });

  it('lets one sample stand for 30 s at most, and leaves out samples outside the walk or the range', () => {
    const summary = heartRateSummary(
      [
        { at: WALK_START - 5_000, bpm: 120 },
        { at: WALK_START, bpm: 120 },
        { at: WALK_START + 120_000, bpm: 300 },
        { at: WALK_START + 200_000, bpm: 120 },
      ],
      WALK_START,
      WALK_START + 180_000,
      40,
    );
    expect(summary?.zoneSeconds).toEqual([0, 30, 0, 0, 0]);
  });

  it('is null without a sample in the walk', () => {
    expect(heartRateSummary([], WALK_START, WALK_START + 60_000, 30)).toBeNull();
  });
});

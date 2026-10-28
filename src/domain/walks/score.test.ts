import { describe, expect, it } from 'vitest';
import { effortOf, SCORE_WEIGHTS, walkScore, type ScoreInput } from './score';

const BASE: ScoreInput = {
  activeSeconds: 30 * 60,
  briskMinutes: 30,
  briskKnown: true,
  speedFrom: 'route',
  speedKmh: 6.5,
  met: 5.5,
  earlierSpeeds: [6.0, 6.5],
};

describe('walkScore', () => {
  it('weighs brisk share 40, duration 25, intensity 20 and pace 15', () => {
    expect(SCORE_WEIGHTS).toEqual({ brisk: 40, duration: 25, intensity: 20, pace: 15 });
    expect(walkScore(BASE)).toEqual({
      score: 100,
      parts: { brisk: 40, duration: 25, intensity: 20, pace: 15 },
      paceRatio: 6.5 / 6.25,
    });
  });

  it('gives each part its share', () => {
    const scored = walkScore({
      ...BASE,
      activeSeconds: 20 * 60,
      briskMinutes: 10,
      // 3.8 METs: (3.8 − 2.3) ÷ 3.2 of 20.
      met: 3.8,
      speedKmh: 5.0,
      // 5.0 ÷ 5.5 = 0.909: (0.909 − 0.85) ÷ 0.15 of 15.
      earlierSpeeds: [5.5],
    });
    expect(scored.parts).toEqual({ brisk: 20, duration: 16.7, intensity: 9.4, pace: 5.9 });
    expect(scored.score).toBe(52);
  });

  it('keeps the duration full past 30 minutes and every part within its weight', () => {
    const scored = walkScore({ ...BASE, activeSeconds: 90 * 60, briskMinutes: 95, met: 8.5 });
    expect(scored.parts.duration).toBe(25);
    expect(scored.parts.brisk).toBe(40);
    expect(scored.parts.intensity).toBe(20);
  });

  it('gives no pace points at 85 % of the average or slower', () => {
    expect(walkScore({ ...BASE, speedKmh: 5.1, earlierSpeeds: [6] }).parts.pace).toBe(0);
  });

  it('leaves the pace out with nothing to compare, and scales the rest to 100', () => {
    const scored = walkScore({ ...BASE, briskMinutes: 15, earlierSpeeds: [] });
    expect(scored.parts.pace).toBeNull();
    expect(scored.paceRatio).toBeNull();
    // (20 + 25 + 20) of 85.
    expect(scored.score).toBe(Math.round((65 / 85) * 100));
  });

  it('leaves brisk out without steps or a route, and intensity out without a speed', () => {
    const noBrisk = walkScore({ ...BASE, briskKnown: false, briskMinutes: 0 });
    expect(noBrisk.parts.brisk).toBeNull();
    expect(noBrisk.score).toBe(100);
    const noSpeed = walkScore({ ...BASE, speedFrom: 'none', speedKmh: null, met: 3 });
    expect(noSpeed.parts.intensity).toBeNull();
    expect(noSpeed.parts.pace).toBeNull();
    // (40 + 25) of 65.
    expect(noSpeed.score).toBe(100);
  });

  it('gives no score when neither brisk minutes nor intensity was measured', () => {
    const scored = walkScore({
      ...BASE,
      briskKnown: false,
      briskMinutes: 0,
      speedFrom: 'none',
      speedKmh: null,
      met: 3,
    });
    expect(scored.score).toBeNull();
    expect(scored.parts.duration).toBe(25);
  });

  it('scores an empty walk 0', () => {
    expect(walkScore({ ...BASE, activeSeconds: 0, briskMinutes: 0, met: 2.3 }).parts).toMatchObject(
      {
        brisk: 0,
        duration: 0,
        intensity: 0,
      },
    );
  });
});

describe('effortOf', () => {
  it('reads under 3 METs as light, 3 to 6 as moderate, 6 and up as vigorous', () => {
    expect(effortOf(2.8)).toBe('light');
    expect(effortOf(3)).toBe('moderate');
    expect(effortOf(5.5)).toBe('moderate');
    expect(effortOf(7)).toBe('vigorous');
  });
});

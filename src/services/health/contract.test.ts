import { describe, expect, it } from 'vitest';
import {
  HEALTH_ERROR_CODES,
  HEALTH_READ_KINDS,
  HEALTH_WRITE_KINDS,
  healthErrorCode,
  type HealthConnectPlugin,
  type HealthReadKind,
  type HealthWriteKind,
} from './contract';

describe('the plugin contract', () => {
  it('lists every read and write kind once', () => {
    const reads: Record<HealthReadKind, true> = {
      steps: true,
      activeCalories: true,
      totalCalories: true,
      distance: true,
      exercise: true,
      weight: true,
    };
    const writes: Record<HealthWriteKind, true> = { nutrition: true, weight: true };
    expect([...HEALTH_READ_KINDS].sort()).toEqual(Object.keys(reads).sort());
    expect([...HEALTH_WRITE_KINDS].sort()).toEqual(Object.keys(writes).sort());
  });

  it('names the methods of the phase file', () => {
    const methods: Record<keyof HealthConnectPlugin, true> = {
      availability: true,
      grantedPermissions: true,
      requestPermissions: true,
      openHealthConnectSettings: true,
      readDailyTotals: true,
      readExerciseSessions: true,
      readWeights: true,
      writeNutrition: true,
      deleteNutrition: true,
      writeWeight: true,
      deleteWeight: true,
    };
    expect(Object.keys(methods)).toHaveLength(11);
  });

  it('reads the code a rejection carries, and calls anything else unknown', () => {
    for (const code of HEALTH_ERROR_CODES) {
      expect(healthErrorCode(Object.assign(new Error('x'), { code }))).toBe(code);
    }
    expect(healthErrorCode({ code: 'UNAVAILABLE' })).toBe('unknown');
    expect(healthErrorCode(new Error('plain'))).toBe('unknown');
    expect(healthErrorCode(null)).toBe('unknown');
  });
});
